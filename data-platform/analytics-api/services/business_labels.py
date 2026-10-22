"""Display entity identity without merging distinct entities with equal names."""


MISSING_LABEL='Chưa ghi nhận'


def dimension_labeler(dimensions,rows,definitions):
    collisions={}
    for dim in dimensions:
        identity=definitions.get(dim,{}).get('identity')
        if not identity:
            continue
        by_name={}
        for row in rows:
            by_name.setdefault(str(row.get(dim)),set()).add(str(row.get(identity)))
        collisions[dim]={name for name,ids in by_name.items() if len(ids)>1}
    def label(row,dim):
        if row.get(dim) is None:
            return MISSING_LABEL  # a NULL group is a real population ("chưa ghi nhận"), never the text "None"
        value=str(row[dim]);definition=definitions.get(dim,{})
        value=str(definition.get('value_labels',{}).get(value,value))  # governed business wording, never raw enum codes
        identity=definition.get('identity');code=row.get(identity) if identity else None
        if code is not None and str(code)!=value and (definition.get('display_identity') or value in collisions.get(dim,set())):
            return f'{value} ({code})'
        return value
    return label
