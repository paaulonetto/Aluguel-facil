import test from 'node:test';
import assert from 'node:assert/strict';
import {blank,charges,cash} from './model.js';
test('Vencimento no último dia de fevereiro e limites do contrato',()=>{
 const d=blank();d.leases.push({id:'a',start:'2024-02-15',end:'2024-03-30',day:31,amount:95000});
 assert.equal(charges(d,'2024-02')[0].due,'2024-02-29');assert.deepEqual(charges(d,'2024-03'),[]);
});
test('Pagamento em mês posterior liquida a competência e entra no caixa na data de recebimento',()=>{
 const d=blank();d.leases.push({id:'a',start:'2025-01-01',end:'2025-12-31',day:5,amount:95000});
 d.payments.push({key:'a/2025-01',date:'2025-02-01',amount:95000});d.expenses.push({date:'2025-02-02',amount:4000});
 assert.equal(charges(d,'2025-01')[0].status,'Pago');assert.equal(cash(d,'2025-01').income,0);assert.deepEqual(cash(d,'2025-02'),{income:95000,cost:4000});
});
