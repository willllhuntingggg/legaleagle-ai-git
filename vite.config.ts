import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 设置为相对路径，确保打包后在任何目录下都能正确加载资源
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // 确保构建时能正确处理入口文件
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
});