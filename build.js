import {mkdir,copyFile,readFile,writeFile,readdir} from 'node:fs/promises';
await mkdir('dist/assets/img',{recursive:true});
// Tudo o que o site publicado (pasta dist/) precisa: código, estilos, logos, ícones e fotos otimizadas.
const files=['index.html','style.css','tokens.css','app.js','model.js','logotipo-cor.svg','logotipo-negativo.svg','icone-app.svg',
 'favicon.ico','favicon.svg','apple-touch-icon.png','icon-192.png','icon-512.png','icon-maskable-512.png','site.webmanifest'];
for(const file of files)await copyFile(file,'dist/'+file);
for(const img of await readdir('assets/img'))await copyFile('assets/img/'+img,'dist/assets/img/'+img);
// Inline both modules so Chrome can open the dashboard directly from disk.
const [html, tokens, css, model, app] = await Promise.all(
  ['index.html', 'tokens.css', 'style.css', 'model.js', 'app.js'].map(file => readFile(file, 'utf8'))
);
const script = model.replace(/^export /gm, '') + '\n' + app.replace(/^import [^\n]+\n/, '');
const standalone = html
  .replace('<link rel="stylesheet" href="tokens.css">', () => '<style>' + tokens + '</style>')
  .replace('<link rel="stylesheet" href="style.css">', () => '<style>' + css + '</style>')
  .replace('<script type="module" src="app.js"></script>', () => '<script type="module">' + script + '</script>');
await writeFile('AlugaFacil.html', standalone);
