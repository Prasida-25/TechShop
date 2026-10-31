const { getPool, closePool, describeDatabaseError } = require('../src/config/database');

async function main() {
  try {
    const connection = getPool();
    // Only SELECT statements: no application data is read or changed.
    const [tables] = await connection.execute(
      'SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
      [process.env.DB_NAME],
    );
    const [columns] = await connection.execute(
      'SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION',
      [process.env.DB_NAME],
    );
    const [foreignKeys] = await connection.execute(
      'SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION',
      [process.env.DB_NAME],
    );
    console.log('MySQL connection and schema inspection succeeded.');
    console.log(JSON.stringify({ tables, columns, foreignKeys }, null, 2));
    if (!tables.length) console.log('No tables visible to this database user.');
  } catch (error) {
    // Never print raw messages, config, stack traces, or credentials.
    console.error(`[MySQL] ${describeDatabaseError(error)}`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

main().catch(() => {
  console.error('Unable to finish the MySQL check safely. No error details printed.');
  process.exitCode = 1;
});
