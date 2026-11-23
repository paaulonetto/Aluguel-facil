import http from 'node:http';
import {readFile} from 'node:fs/promises';
const files={'/':['index.html','text/html'],'/style.css':['style.css','text/css'],'/model.js':['model.js','text/javascript'],'/app.js':['app.js','text/javascript']};
http.createServer(async(req,res)=>{const file=files[req.url];if(!file){res.writeHead(404).end();return}try{res.setHeader('Content-Type',file[1]+'; charset=utf-8');res.end(await readFile(new URL(file[0],import.meta.url)))}catch{res.writeHead(500).end()}}).listen(4173,'127.0.0.1',()=>console.log('http://127.0.0.1:4173'));
