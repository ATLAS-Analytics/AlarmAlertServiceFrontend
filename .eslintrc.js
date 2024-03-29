module.exports = {
  "plugins": [
    "jquery"
  ],
  env: {
    es6: true,
    'shared-node-browser': true
  },
  extends: 'airbnb-base',
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  rules: {
    'no-console': 'off',
    'no-plusplus': 'off',
    'no-underscore-dangle': 'off',
  },
};
