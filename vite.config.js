import { defineConfig } from 'vite'
import reactRefresh from '@vitejs/plugin-react-refresh'
// import analyze from 'rollup-plugin-analyzer'

/* https://github.com/vitejs/vite/issues/3477#issuecomment-848827327 */
function rechartsPlugin () {
  return {
    name: 'recharts_plugin',
    transform (code, id) {
      if (id.includes('reduce-css-calc/dist/parser.js')) {
        return (
          code.replace('typeof require !== \'undefined\'', 'true')
        )
      }
      return null
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    reactRefresh(),
    rechartsPlugin()
  ],
  publicDir: './public',
  base: '/',
  resolve: {
    alias: {
      'mapbox-gl': 'maplibre-gl'
    }
  },
  server: {
    proxy: {
      '/api/': {
        target: 'http://0.0.0.0:4000',
        changeOrigin: true,
        timeout: 1000,
        proxyTimeout: 1000
      }
    }
  },
  build: {
    cssCodeSplit: false
  //   rollupOptions: {
  //     plugins: [
  //       analyze()
  //     ]
  //   }
  }
})
