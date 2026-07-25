import rootConfig from '../eslint.config.mjs'

export default [...rootConfig, { ignores: ['playwright-report/**', 'test-results/**'] }]
