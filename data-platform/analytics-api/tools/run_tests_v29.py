"""Complete suite with isolated offline storage and archived planner policies.

Retired graph tests select their historical one-call policy in archive_planner;
hybrid tests explicitly select the production three-call ceiling in setUp.
"""
import os
import unittest
from unittest.mock import patch
from services import result_artifact_store, session_service


class IsolatedResult(unittest.TextTestResult):
    def startTest(self, test):
        result_artifact_store._store = None
        session_service._sessions.clear()
        session_service._timestamps.clear()
        super().startTest(test)


if __name__=='__main__':
    config={k:v for k,v in os.environ.items() if k not in {'DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN','DATA_ANALYST_ENABLE_CONTRACT_REPAIR'}}
    config.update(AI_OFFLINE='1',DATA_ANALYST_ENV='development',DATA_ANALYST_SESSION_STORE='memory',DATA_ANALYST_ARTIFACT_STORE='memory')
    with patch.dict(os.environ, config, clear=True):
        suite=unittest.defaultTestLoader.discover('tests')
        result=unittest.TextTestRunner(verbosity=1,resultclass=IsolatedResult).run(suite)
    raise SystemExit(not result.wasSuccessful())
