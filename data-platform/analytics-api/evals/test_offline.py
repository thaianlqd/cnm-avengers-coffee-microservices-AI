"""Run offline suites without inheriting production flags or credentials.

python -m evals.test_offline
Individual tests opt into the policy they exercise; archived contracts retain
their original defaults. No test should use a production API credential.
"""
import os
import sys
import unittest


def main():
    for key in list(os.environ):
        if key.startswith('DATA_ANALYST_'):
            os.environ.pop(key)
    os.environ.update(AI_OFFLINE='1',DATA_ANALYST_ENV='development',
        DATA_ANALYST_SESSION_STORE='memory',DATA_ANALYST_ARTIFACT_STORE='memory',
        DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN='1',DATA_ANALYST_ENABLE_CONTRACT_REPAIR='0',
        GEMINI_API_KEY='',GOOGLE_API_KEY='',GROQ_API_KEY='')
    result=unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.discover('tests'))
    sys.exit(0 if result.wasSuccessful() else 1)


if __name__=='__main__':main()
