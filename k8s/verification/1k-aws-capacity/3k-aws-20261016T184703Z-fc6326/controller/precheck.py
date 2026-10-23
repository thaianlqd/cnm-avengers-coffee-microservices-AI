from client import *
import ast,hashlib
for p in pathlib.Path(__file__).parent.glob('*.py'):ast.parse(p.read_text())
assert hashlib.sha256((root/'load-tests/k6/customer-browse-3k.js').read_bytes()).hexdigest()=='8746a95c5e11382ded7f355e68ecec34a759346bc079b3db2b40c33cefed2fb2'
assert state()['max_generators']==3 and state()['runtime_minutes']==120
assert len(state()['roles'])==6
assert all((folder/r/'verified').exists() for r in state()['roles'])
assert not (folder/'FINISH').exists()
print('syntax/workload/authenticated bounded topology precheck PASS')
