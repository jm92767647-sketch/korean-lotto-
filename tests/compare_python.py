"""Run against an unmodified original: python tests/compare_python.py ORIGINAL_DIR
Requires the original Python requirements, only for cross-validation.
"""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(sys.argv[1]).resolve()))
import lotto_optimizer as lo

here = Path(__file__).resolve().parent
u = lo.generate_universe([1, 3, 5, 7, 9, 11], n=16)
selected, state = lo.greedy_initial_solution(u, games=3, verbose=False)
greedy = u.rows[selected].tolist()
selected, state, record = lo.local_search(selected, state, verbose=False)
selected, state, record = lo.local_search(selected, state, secondary=True, best_c4=record, verbose=False)
value = lo.evaluate_portfolio(u, selected)
reference = {'small': {'size': len(u.rows), 'greedy': greedy, 'final': u.rows[selected].tolist(),
                       'c4': value['c4'], 'c5': value['c5'], 'histogram': value['histogram']}}
(here / 'python-reference.json').write_text(json.dumps(reference, indent=2), encoding='utf-8')
print('Python small universe:', reference['small'], flush=True)

full = json.loads((here / 'full-result.json').read_text(encoding='utf-8'))
u45 = lo.generate_universe(full['previous'])
ids = [int(u45.row_of_id[lo._rank(lo.np.array(t, dtype=lo.np.uint8))]) for t in full['tickets']]
checked = lo.evaluate_portfolio(u45, ids)
assert len(u45.rows) == full['universeSize']
for key in ('c4', 'c5', 'histogram', 'individual', 'matrix'):
    assert checked[key] == full[key], (key, checked[key], full[key])
reference['full_js_portfolio_verified_in_python'] = {
    'size': len(u45.rows), 'c4': checked['c4'], 'c5': checked['c5'], 'histogram': checked['histogram']}
(here / 'python-reference.json').write_text(json.dumps(reference, indent=2), encoding='utf-8')
print('Python full cross-validation:', reference['full_js_portfolio_verified_in_python'])
