import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
for(const file of ['index.html','style.css','app.js','model.js'])await copyFile(file,'dist/'+file);
// Inline both modules so Chrome can open the dashboard directly from disk.
const [html, css, model, app] = await Promise.all(
  ['index.html', 'style.css', 'model.js', 'app.js'].map(file => readFile(file, 'utf8'))
);
const script = model.replace(/^export /gm, '') + '\n' + app.replace(/^import [^\n]+\n/, '');
const standalone = html
  .replace('<link rel="stylesheet" href="style.css">', () => '<style>' + css + '</style>')
  .replace('<script type="module" src="app.js"></script>', () => '<script type="module">' + script + '</script>');
await writeFile('AlugaFacil.html', standalone);
