const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('QA: Khởi động trình duyệt...');
  // Mở trình duyệt có giao diện để sếp xem
  const browser = await chromium.launch({ headless: false, slowMo: 300 }); 
  const context = await browser.newContext({ viewport: null }); // Mở full size màn hình
  const page = await context.newPage();
  
  const fileUrl = 'http://localhost:8000';
  console.log('QA: Đang truy cập', fileUrl);
  await page.goto(fileUrl);
  
  try {
      console.log('QA: Chờ web load...');
      await page.waitForTimeout(1000); 

      // Kiểm tra xem có bị dính màn hình khóa không
      const lockScreenVisible = await page.isVisible('#lock-screen:not(.hidden)');
      if (lockScreenVisible) {
          console.log('QA: Đang bypass màn hình khóa...');
          await page.click('button:has-text("Skip sync & Use local data")');
      }

      console.log('QA: Đang click vào nút Tạo Document...');
      await page.waitForSelector('.stat-card');
      await page.click('button:has-text("New Document")');
      
      console.log('QA: Chọn loại Environment...');
      await page.waitForSelector('.tpl-card');
      await page.click('button.tpl-card:has-text("Environments")');
      
      console.log('QA: Đang điền form chi tiết...');
      await page.waitForSelector('#ed-cat');
      
      await page.fill('#ed-title', 'Production Super Environment');
      await page.fill('#ed-env-fe', 'https://www.qa-hub.com');
      await page.fill('#ed-env-be', 'https://api.qa-hub.com');
      await page.fill('#ed-env-db', 'postgres://admin:secret@aws.rds.com/prod');
      await page.selectOption('#ed-env-status', 'healthy');
      
      // Tick chọn bừa 1 cái credential (nếu có)
      const creds = await page.$$('.ed-env-cred');
      if (creds.length > 0) {
         console.log('QA: Chọn Credentials...');
         await creds[0].check();
      }

      // Giả vờ cuộn xuống tí cho ngầu
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(1000);

      console.log('QA: Nhấn nút Save...');
      await page.click('button:has-text("Save")');

      console.log('QA: Chờ sang giao diện View...');
      await page.waitForSelector('.fav-btn');

      console.log('QA: Kiểm tra xem đã lưu dữ liệu thành công chưa...');
      await page.waitForTimeout(1000); // Dừng 1s để sếp soi dữ liệu
      
      const viewerHtml = await page.innerHTML('#content');
      if (viewerHtml.includes('https://www.qa-hub.com') && viewerHtml.includes('postgres://')) {
          console.log('✅ QA SUCCESS: Dữ liệu Environment đã được hiển thị đẹp đẽ!');
      } else {
          console.log('❌ QA BUG: Lưu xong lại mất tiêu dữ liệu rồi sếp ơi!');
      }

      console.log('QA: Dừng màn hình 3 giây để sếp kiểm tra...');
      await page.waitForTimeout(3000);

  } catch (err) {
      console.error('❌ QA Test Failed:', err);
  } finally {
      await browser.close();
      console.log('QA: Test kết thúc. Trả lại màn hình cho sếp!');
  }
})();
