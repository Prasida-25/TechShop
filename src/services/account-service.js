const argon2 = require('argon2');
const crypto = require('node:crypto');
const { AccountError, normalizePhone, registrationInput, profileInput, passwordInput, addressInput } = require('../utils/account-validation');

function createAccountService(users, addresses, secret) {
  let dummyHash;
  const stamp = (hash) => crypto.createHmac('sha256', secret).update(hash).digest('hex');
  const publicUser = (user) => ({ user_id: user.user_id, full_name: user.full_name, phone: user.phone, role: user.role });
  const duplicate = () => new AccountError({ phone: 'Số điện thoại đã được sử dụng.' }, 409);

  async function register(body) {
    const data = registrationInput(body);
    if (await users.findByPhone(data.phone)) throw duplicate();
    const hash = await argon2.hash(data.password, { type: argon2.argon2id });
    try { return await users.create(data, hash); }
    catch (error) { if (error.code === 'ER_DUP_ENTRY') throw duplicate(); throw error; }
  }

  async function login(body) {
    const phone = normalizePhone(body?.phone);
    const password = typeof body?.password === 'string' && body.password.length <= 128 ? body.password : '';
    const user = phone ? await users.findByPhone(phone) : null;
    // Cả số không tồn tại cũng phải thực hiện một lần verify.
    dummyHash ||= argon2.hash(crypto.randomBytes(32).toString('hex'), { type: argon2.argon2id });
    let verified = false;
    try { verified = await argon2.verify(user?.password || await dummyHash, password); }
    catch { /* Hash không hợp lệ cũng là lỗi đăng nhập chung. */ }
    if (!phone || !password || !user || !['user', 'admin'].includes(user.role) || !verified) {
      throw new AccountError({ general: 'Số điện thoại hoặc mật khẩu không đúng.' }, 401);
    }
    return { user: publicUser(user), authVersion: stamp(user.password) };
  }

  async function sessionUser(session) {
    if (!Number.isInteger(session?.userId)) return null;
    const user = await users.findById(session.userId);
    if (!user || !['user', 'admin'].includes(user.role) || typeof session.authVersion !== 'string') return null;
    const expected = Buffer.from(stamp(user.password));
    const actual = Buffer.from(session.authVersion);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    return publicUser(user);
  }

  async function updateProfile(userId, body) {
    const data = profileInput(body);
    const existing = await users.findByPhone(data.phone);
    if (existing && Number(existing.user_id) !== userId) throw duplicate();
    try { await users.updateProfile(userId, data); }
    catch (error) { if (error.code === 'ER_DUP_ENTRY') throw duplicate(); throw error; }
  }

  async function changePassword(userId, body) {
    const data = passwordInput(body);
    const user = await users.findById(userId);
    if (!user || !await argon2.verify(user.password, data.current)) throw new AccountError({ current_password: 'Mật khẩu hiện tại không đúng.' });
    if (await argon2.verify(user.password, data.next)) throw new AccountError({ new_password: 'Mật khẩu mới phải khác mật khẩu hiện tại.' });
    const hash = await argon2.hash(data.next, { type: argon2.argon2id });
    if (!await users.updatePassword(userId, hash, user.password)) throw new AccountError({ general: 'Mật khẩu vừa thay đổi. Vui lòng đăng nhập lại.' }, 409);
  }

  return { register, login, sessionUser, updateProfile, changePassword,
    listAddresses: (userId) => addresses.list(userId),
    findAddress: (userId, id) => addresses.findOwn(userId, id),
    // Form mới không dùng quận/huyện; vẫn lưu chuỗi rỗng để phù hợp cột NOT NULL.
    // Chỉ áp dụng khi lưu địa chỉ, không chuẩn hóa lại snapshot của đơn hàng cũ.
    saveAddress: (userId, body, id) => addresses.save(userId, addressInput({ ...body, district: '' }), id),
    removeAddress: (userId, id) => addresses.remove(userId, id),
    defaultAddress: (userId, id) => addresses.makeDefault(userId, id),
  };
}

module.exports = { createAccountService };
