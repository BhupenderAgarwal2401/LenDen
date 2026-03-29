const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7']
      }
    }
  ],
  webServer: {
    command: 'python3 -m http.server 8080',
    url: 'http://127.0.0.1:8080/index.html',
    reuseExistingServer: true,
    timeout: 30000
  }
});
