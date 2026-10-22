import json
from tests import cw_harness as h
try:
    r,p,calls=h.run([h.envelope()])
except Exception as e:
    si=h.LAST['pipeline'].semantic_info
    print('ERR',e, si.get('publication_issues'), si.get('quality_not_scored_reason'))
    import services.analysis_quality_service as q
