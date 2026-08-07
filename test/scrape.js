const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080/index.html#/scenario/wizard');
  
  // Wait for the form to load
  await page.waitForSelector('text="Step 1 of 5"');
  
  // Fill the required fields in step 1
  // Loan Amount
  await page.fill('input[id*="LoanAmount"]', '100000');
  // Property Address
  await page.fill('textarea[id*="PropertyAddress"]', '123 Fake St');
  
  // Click Next Step
  await page.click('text="Next Step"');
  
  // Wait a bit for validation to finish and DOM to update
  await page.waitForTimeout(2000);
  
  // Extract HTML of the layout
  const html = await page.evaluate(() => {
    return document.body.innerHTML;
  });
  
  const fs = require('fs');
  fs.writeFileSync('dom_dump.html', html);
  
  console.log("Successfully dumped DOM.");
  
  await browser.close();
})();
