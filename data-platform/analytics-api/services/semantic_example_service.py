"""Versioned confirmed hints. The current resolver remains the only authority."""
import json
from pathlib import Path
from services.analysis_intent import AnalysisIntentEnvelope


def confirmed_examples(domains, catalog, limit=2):
    from services.analytical_resolver import AnalyticalResolver
    from datetime import date
    resolver=AnalyticalResolver(catalog,date.today())
    examples=json.loads((Path(__file__).resolve().parent.parent/'metadata'/'confirmed_analysis_examples.json').read_text())
    result=[]
    for example in examples:
        if example['domain_id'] not in domains:
            continue
        intent=AnalysisIntentEnvelope.model_validate(example['intent'])
        if all(set(r.metric_ids)<=set(resolver.index.metrics) and set(r.dimension_ids)<=set(resolver.index.dimensions) for r in intent.requirements):
            result.append(dict(question=example['question'],intent=example['intent']))
        if len(result)>=limit:break
    return result
