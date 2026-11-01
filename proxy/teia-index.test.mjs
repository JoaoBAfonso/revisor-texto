import test from 'node:test';
import assert from 'node:assert/strict';
import { expandAcronym, nameTokens, unpackContract } from './teia-index.mjs';

test('expande siglas declaradas com «&» a partir dos textos do próprio declarante', () => {
  assert.deepEqual(expandAcronym('AE&F, Sociedade de Advogados, RL', ['Sócia da AE&F - Alfa Exemplo & Ferraz']), ['Alfa Exemplo & Ferraz']);
  assert.deepEqual(expandAcronym('AE&F, Sociedade de Advogados, RL', ['Sem relação com a sigla']), []);
  assert.deepEqual(expandAcronym('Quintaviva, Lda', ['Quintaviva']), []);
});

test('normaliza grafias antigas e desempacota contratos do repositório de dados', () => {
  assert.deepEqual(nameTokens('Loja Fictícia Electrodomésticos'), nameTokens('Loja Ficticia Eletrodomésticos'));
  const row = unpackContract(['c1', '2017-05-29', ['506000001'], ['510000001'], 'Patrocínio judiciário', 54000, 'AD', 'S', '', '', -1, 1]);
  assert.equal(row.procedimento, 'AD');
  assert.equal(row.valor, 54000);
  assert.equal(row.criteriosMateriais, true);
  assert.match(row.url, /base\.gov\.pt/);
  assert.throws(() => unpackContract({ id: 'x' }), /formato desconhecido/);
});
