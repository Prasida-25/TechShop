// Chỉ nhận dạng ảnh raster được hỗ trợ. Không tin đuôi file hoặc MIME từ trình duyệt.
const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'];

function detectImageMime(data) {
  if (!Buffer.isBuffer(data)) return '';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg';
  if (data.length >= 16 && data.toString('ascii',0,4) === 'RIFF' && data.toString('ascii',8,12) === 'WEBP'
    && ['VP8 ', 'VP8L', 'VP8X'].includes(data.toString('ascii',12,16))) return 'image/webp';
  if (data.length >= 10 && ['GIF87a','GIF89a'].includes(data.toString('ascii',0,6))
    && data.readUInt16LE(6) > 0 && data.readUInt16LE(8) > 0) return 'image/gif';
  if (data.length >= 26 && data.toString('ascii',0,2) === 'BM'
    && data.readUInt32LE(2) === data.length && data.readUInt32LE(14) >= 12) return 'image/bmp';
  // AVIF dùng container ISO BMFF: chỉ đọc brand trong box ftyp có kích thước hợp lệ.
  // Không nhận HEIC/HEIF chỉ vì cùng container.
  if (data.length >= 16 && data.toString('ascii',4,8) === 'ftyp') {
    const end = data.readUInt32BE(0);
    if (end >= 16 && end <= data.length && end % 4 === 0) {
      const brands = [data.toString('ascii',8,12)];
      for (let offset = 16; offset < end; offset += 4) brands.push(data.toString('ascii',offset,offset+4));
      if (brands.includes('avif') || brands.includes('avis')) return 'image/avif';
    }
  }
  return '';
}

module.exports = { IMAGE_MIME_TYPES, detectImageMime };
