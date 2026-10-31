// Giữ bộ lọc mở trên desktop, thu gọn lúc tải trên điện thoại.
// Không có JavaScript thì details vẫn mở và các form GET vẫn hoạt động.
const listingFilters = document.querySelector('.listing-filters');
if (listingFilters && window.matchMedia('(max-width: 734px)').matches) {
  listingFilters.open = false;
}
