"""Reviewable analysis decisions derived from catalog, plans and evidence IDs."""


def explain_analysis(artifacts, catalog, charts=(), evidence=()):
    r = catalog.registry
    objectives = {
        "aggregate": "Đối chiếu quy mô theo các nhóm đã chọn",
        "ranking": "Xác định nhóm đóng góp nổi bật trong phạm vi",
        "trend": "Kiểm tra diễn biến theo thời gian",
        "distribution": "Đo cơ cấu đóng góp của tập dữ liệu",
        "cross_tab": "Đối chiếu đồng thời hai chiều phân tích",
        "relationship": "Kiểm tra mối liên hệ quan sát, không kết luận nhân quả",
        "detail": "Đối chiếu các bản ghi chi tiết",
    }
    visual_reasons = {
        "bar": "So sánh giá trị giữa các nhóm cùng đơn vị",
        "horizontal_bar": "So sánh thứ hạng và đọc tên nhóm dài",
        "line": "Theo dõi các điểm dữ liệu theo thứ tự thời gian",
        "area": "Theo dõi quy mô theo thời gian",
        "multi_line": "Đối chiếu diễn biến của nhiều nhóm trên cùng trục thời gian",
        "donut": "Đo tỷ trọng trên tập đầy đủ có giá trị không âm",
        "pie": "Đo tỷ trọng trên tập đầy đủ có giá trị không âm",
        "heatmap": "Đối chiếu giá trị theo hai chiều phân tích",
        "grouped_bar": "So sánh các nhóm và chuỗi cùng đơn vị",
        "stacked_bar": "Đối chiếu đóng góp của các thành phần cùng đơn vị",
        "stacked_100": "So sánh cơ cấu phần trăm trong từng nhóm đầy đủ",
        "scatter": "Quan sát quan hệ giữa hai đại lượng; không chứng minh nhân quả",
    }
    explanations = []
    for id, a in artifacts.items():
        refs = [e["id"] for e in evidence if e["scope_ref"] == id]
        sources = {a.plan.source}
        sources.update(j["to_table"] for j in a.plan.joins)
        sources.update(d["table"] for d in a.grounded.dimensions.values())
        item = {
            "query_id": id,
            "role": a.query.role,
            "parent_id": a.query.parent_id,
            "purpose": a.query.purpose,
            "population_relation": a.query.population_relation,
            "population_note": ("Phân tích liên quan dùng điều kiện đo lường riêng của chỉ số; giữ nguyên bộ lọc và thời gian đã chọn. Không suy ra tỷ trọng hoặc quan hệ nhân quả với phần chính."
                                if a.query.population_relation == "related" else None),
            "supporting_reason": objectives[a.query.operation] if a.query.role == "supporting" else None,
            "subject": r["subjects"][a.query.subject]["business_name"],
            "objective": objectives[a.query.operation],
            "data_sources": [
                catalog.overlay.get("silver_tables", {})
                .get(s, {})
                .get("business_name", "Nguồn dữ liệu đã đối chiếu metadata")
                for s in sorted(sources)
            ],
            "metrics": [
                {
                    "id": m,
                    "label": a.grounded.metrics[m]["business_name"],
                    "unit": a.grounded.metrics[m]["unit"],
                    "grain": a.grounded.metrics[m]["grain"],
                    "historical": bool(a.grounded.metrics[m].get("time_column")),
                    "business_filters": a.grounded.metrics[m].get(
                        "business_filters", []
                    ),
                    "population_requirements": [
                        r["dimensions"][d]["business_name"] + " có giá trị"
                        for column in a.grounded.metrics[m].get("required_non_null", [])
                        for d, meta in r["dimensions"].items()
                        if meta["table"] + "." + meta["column"] == column
                    ],
                }
                for m in a.plan.metrics
            ],
            "dimensions": [
                r["dimensions"][d]["business_name"] for d in a.query.group_by
            ],
            "filters": [
                {
                    "label": r["dimensions"][f.dimension]["business_name"],
                    "operator": f.operator,
                    "value": f.value,
                }
                for f in a.query.filters
            ],
            "period": a.grounded.period,
            "granularity": a.query.granularity if a.query.operation == "trend" else None,
            "ranking": {"top_n": a.query.ranking.top_n, "direction": a.query.ranking.direction, "metric": r["metrics"][a.query.ranking.metric]["business_name"]} if a.query.ranking else None,
            "selection": (
                "Top N"
                if a.plan.ranking
                else "limited" if a.plan.explicit_limit else "complete"
            ),
            "rows_returned": len(a.result["rows"]) if a.result is not None else None,
            "evidence_refs": refs,
            "visuals": [
                {
                    "id": c["id"],
                    "type": c["chart_type"],
                    "reason": visual_reasons.get(
                        c["chart_type"], "Trực quan hóa kết quả đã kiểm chứng"
                    ),
                }
                for c in charts
                if c.get("query_id") == id
            ],
        }
        explanations.append(item)
    return explanations
