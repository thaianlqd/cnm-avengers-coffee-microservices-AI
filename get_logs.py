import subprocess
import os

with open('kafka_logs.txt', 'w') as f:
    subprocess.run(['docker', 'logs', 'avengers_kafka'], stdout=f, stderr=subprocess.STDOUT)
