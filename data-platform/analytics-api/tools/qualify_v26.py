"""Run all backend regressions with global offline guards; no application startup."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))

if __name__=='__main__':
    with patch.dict(os.environ,{"AI_OFFLINE":"1"}),patch('requests.sessions.Session.request',side_effect=AssertionError('External HTTP forbidden')),patch('psycopg2.connect',side_effect=AssertionError('Live database forbidden')):
        suite=unittest.defaultTestLoader.discover(str(ROOT/'tests'),top_level_dir=str(ROOT))
        outcome=unittest.TextTestRunner(verbosity=1).run(suite)
    raise SystemExit(0 if outcome.wasSuccessful() else 1)
