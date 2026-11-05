/** Rebuild the CSS after changing index.html or app.js:
 *  npx tailwindcss@3.4.17 -c tailwind.config.js -i src/input.css -o app.css --minify */
module.exports = {
  content: ['./index.html', './app.js'],
  theme: { extend: {} },
  plugins: []
};
