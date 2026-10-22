// Configuration map traced from the existing app, ingestion, batch and Analyst owners.
// This data never claims runtime health or connects streaming Bronze to snapshot batch.
export type FlowId = 'business' | 'serving' | 'events' | 'batch' | 'ai' | 'control';
export type ArchitectureNode = { id: string; lane: FlowId; col: number; title: string; tech: string; detail: string; contract: string };
export type ArchitectureEdge = { source: string; target: string; kind: 'data' | 'control' | 'exception'; label: string };
export const flows: {id: FlowId; title: string; description: string; nodes: string[]}[] = [
  {
    "id": "business",
    "title": "01 · Ứng dụng & dữ liệu nghiệp vụ",
    "description": "Web / Mobile → Gateway → Microservices → PostgreSQL",
    "nodes": [
      "actors",
      "gateway",
      "services",
      "source",
      "commerce"
    ]
  },
  {
    "id": "serving",
    "title": "02 · Phục vụ báo cáo",
    "description": "Đường đọc hiện tại: replica PostgreSQL và các view Silver.",
    "nodes": [
      "replica",
      "rawcopy",
      "warehouse",
      "semantic",
      "api",
      "console"
    ]
  },
  {
    "id": "events",
    "title": "03 · Sự kiện & lưu trữ thô",
    "description": "Polling → Kafka → Consumer → Bronze sự kiện; lỗi được cách ly.",
    "nodes": [
      "producer",
      "kafka",
      "consumer",
      "lake",
      "quarantine"
    ]
  },
  {
    "id": "batch",
    "title": "04 · Snapshot & xử lý batch",
    "description": "Snapshot nguồn riêng → Bronze → Silver → Gold → publication.",
    "nodes": [
      "batchsnapshot",
      "bronze",
      "compute",
      "silverlake",
      "gold",
      "publish"
    ]
  },
  {
    "id": "ai",
    "title": "05 · Trợ lý phân tích AI",
    "description": "Câu hỏi → ngữ nghĩa → AI hiểu ý → kế hoạch → SQL kiểm soát → báo cáo.",
    "nodes": [
      "question",
      "retrieval",
      "provider",
      "proposal",
      "compiler",
      "report"
    ]
  },
  {
    "id": "control",
    "title": "06 · Điều phối, kiểm soát & đầu ra",
    "description": "Dependency, quyền, phiên, chất lượng, lưu báo cáo và xuất tài liệu.",
    "nodes": [
      "airflow",
      "redis",
      "governance",
      "health",
      "saved",
      "export"
    ]
  }
];
export const architectureNodes: ArchitectureNode[] = [
  {
    "id": "actors",
    "lane": "business",
    "col": 0,
    "title": "Web & Mobile",
    "tech": "Khách · Admin · Manager · Staff · Kiosk",
    "detail": "Các ứng dụng khách hàng, vận hành, nhượng quyền và shipper phát sinh dữ liệu nghiệp vụ.",
    "contract": "Actor và phạm vi được xác thực tại backend; Analyst không tự cấp quyền mới."
  },
  {
    "id": "gateway",
    "lane": "business",
    "col": 1,
    "title": "API Gateway",
    "tech": "NestJS · Định tuyến & xác thực",
    "detail": "Tiếp nhận yêu cầu từ các ứng dụng, chuyển tới service nghiệp vụ tương ứng.",
    "contract": "Sơ đồ không gọi các API tạo đơn, thanh toán hoặc ghi dữ liệu."
  },
  {
    "id": "services",
    "lane": "business",
    "col": 2,
    "title": "Microservices",
    "tech": "Identity · Menu · Order · Inventory · News",
    "detail": "Service sở hữu quy tắc đơn hàng, ví, review, chi nhánh, kiosk và các chức năng nguồn.",
    "contract": "Analytics đọc theo source contracts; không ghi ngược vào giao dịch nghiệp vụ."
  },
  {
    "id": "source",
    "lane": "business",
    "col": 3,
    "title": "PostgreSQL nguồn",
    "tech": "Schemas nghiệp vụ",
    "detail": "Nguồn dữ liệu dùng bởi ứng dụng; nguồn đọc cho replica, polling và snapshot batch theo cấu hình.",
    "contract": "Các đường đọc có credential riêng. Tên nhà cung cấp hosting không được suy ra từ công nghệ PostgreSQL."
  },
  {
    "id": "commerce",
    "lane": "business",
    "col": 5,
    "title": "AI Commerce",
    "tech": "Chat · Gợi ý · Dự báo · RAG",
    "detail": "Trợ lý bán hàng và mô hình thương mại phục vụ ứng dụng; tách biệt với AI Data Analyst.",
    "contract": "Dự báo khác số thực tế. Xem sơ đồ không train, reload RAG hoặc gọi provider."
  },
  {
    "id": "replica",
    "lane": "serving",
    "col": 0,
    "title": "Đồng bộ định kỳ",
    "tech": "Python · data-sync",
    "detail": "Đọc nguồn theo contract, tải đầy đủ hoặc tăng dần và lưu checkpoint/generation.",
    "contract": "Freshness nạp, độ cũ event, parity và kỳ đóng là các bằng chứng khác nhau."
  },
  {
    "id": "rawcopy",
    "lane": "serving",
    "col": 1,
    "title": "Replica nghiệp vụ",
    "tech": "PostgreSQL Analytics",
    "detail": "Bản chiếu nguồn trong schemas tương ứng, giới hạn cột theo hợp đồng dữ liệu.",
    "contract": "Đây là bản sao phân tích; không phải một DB nguồn giao dịch mới."
  },
  {
    "id": "warehouse",
    "lane": "serving",
    "col": 2,
    "title": "Silver SQL",
    "tech": "Views · Population · Joins",
    "detail": "Chuẩn hóa tên, kiểu và quan hệ phục vụ truy vấn dashboard hiện tại.",
    "contract": "Silver SQL của replica khác Silver Parquet của batch. Không ghép hai generation tùy ý."
  },
  {
    "id": "semantic",
    "lane": "serving",
    "col": 3,
    "title": "Semantic Catalog",
    "tech": "Metric · Dimension · Capability",
    "detail": "Quy định công thức, grain, population, chiều phân tích và quyền truy vấn cho engine chung.",
    "contract": "Có bảng không đồng nghĩa có metric; không hỗ trợ metric chưa có định nghĩa được quản trị."
  },
  {
    "id": "api",
    "lane": "serving",
    "col": 4,
    "title": "Analytics API",
    "tech": "FastAPI · Truy vấn & tác vụ",
    "detail": "Áp dụng principal, policy, compiler và điều phối báo cáo qua API hiện có.",
    "contract": "Giới hạn SQL/time/rows và ownership được kiểm phía máy chủ; không chạy SQL tự do từ model."
  },
  {
    "id": "console",
    "lane": "serving",
    "col": 5,
    "title": "Data Console",
    "tech": "React · Dashboard · Explorer",
    "detail": "Hiển thị báo cáo, danh mục dữ liệu, nguồn kiểm chứng, quản trị và Trợ lý AI.",
    "contract": "Mở sơ đồ, phân trang và xem dashboard không khởi tạo provider AI."
  },
  {
    "id": "producer",
    "lane": "events",
    "col": 0,
    "title": "Producer",
    "tech": "Python · Polling",
    "detail": "Đọc các stream được khai báo, tạo envelope và phát sự kiện có định danh vào Kafka.",
    "contract": "Đây là polling, không phải CDC; cursor chỉ tiến sau xác nhận gửi."
  },
  {
    "id": "kafka",
    "lane": "events",
    "col": 1,
    "title": "Kafka Broker",
    "tech": "Topic · Partition · Offset",
    "detail": "Giữ luồng sự kiện theo partition; consumer group quản lý offset.",
    "contract": "Broker có cấu hình không chứng minh backlog bằng 0; không reset offset để làm đẹp lag."
  },
  {
    "id": "consumer",
    "lane": "events",
    "col": 2,
    "title": "Consumer",
    "tech": "Envelope · Dedup · Checksum",
    "detail": "Kiểm envelope, ghi dữ liệu bền vững; commit offset sau khi write thành công.",
    "contract": "Replay giữ định danh và checksum; lỗi không bị biến thành dòng hợp lệ."
  },
  {
    "id": "lake",
    "lane": "events",
    "col": 3,
    "title": "Bronze sự kiện",
    "tech": "MinIO · Topic / Partition / Offset",
    "detail": "Lưu event và bằng chứng theo offset để truy nguyên hoặc replay có kiểm soát.",
    "contract": "Bronze sự kiện không tự trở thành input snapshot batch. Sơ đồ không nối hai nhánh khi code chưa có bridge."
  },
  {
    "id": "quarantine",
    "lane": "events",
    "col": 5,
    "title": "Cách ly sự kiện lỗi",
    "tech": "Quarantine · Replay có kiểm soát",
    "detail": "Giữ envelope lỗi để chẩn đoán và xử lý lại khi hợp đồng cho phép.",
    "contract": "Replay là tác vụ quản trị riêng; nút xem sơ đồ không thực hiện replay."
  },
  {
    "id": "batchsnapshot",
    "lane": "batch",
    "col": 0,
    "title": "Snapshot batch",
    "tech": "bronze_ingestion.py",
    "detail": "Job Bronze đọc snapshot PostgreSQL theo hợp đồng batch và as-of/run cụ thể.",
    "contract": "Đây là đường đọc nguồn riêng, không giả định đọc Bronze của Kafka consumer."
  },
  {
    "id": "bronze",
    "lane": "batch",
    "col": 1,
    "title": "Bronze snapshot",
    "tech": "MinIO · Immutable run",
    "detail": "Lưu frame nguồn, manifest, checksum và run identity trước chuẩn hóa.",
    "contract": "Chỉ đọc run đã commit; tồn tại object riêng lẻ chưa đủ chứng minh một run hoàn tất."
  },
  {
    "id": "compute",
    "lane": "batch",
    "col": 2,
    "title": "Chuẩn hóa batch",
    "tech": "Batch jobs · Python / pandas",
    "detail": "Kiểm khóa, kiểu số, clock và cardinality; tạo dataset Silver của cùng run.",
    "contract": "Đây là đường batch được cấu hình; xem sơ đồ không khởi động Spark hoặc xác nhận job đã chạy."
  },
  {
    "id": "silverlake",
    "lane": "batch",
    "col": 3,
    "title": "Silver Parquet",
    "tech": "MinIO · Clean / Enriched",
    "detail": "Các output đã chuẩn hóa, có manifest và tham chiếu đúng Bronze input.",
    "contract": "Không nhầm Silver lake với view Silver SQL; missing hoặc dữ liệu lỗi phải có trạng thái cụ thể."
  },
  {
    "id": "gold",
    "lane": "batch",
    "col": 4,
    "title": "Gold aggregates",
    "tech": "MinIO · Chỉ số & phân khúc",
    "detail": "Tổng hợp output theo định nghĩa nghiệp vụ và publication policy.",
    "contract": "Không đối chiếu với Analyst nếu khác grain, status, kỳ hoặc generation."
  },
  {
    "id": "publish",
    "lane": "batch",
    "col": 5,
    "title": "Publication SQL",
    "tech": "Gold versions · Pointer",
    "detail": "Công bố dataset Gold vào PostgreSQL theo phiên bản và pointer transaction.",
    "contract": "Publication phải được kiểm chứng; không thay đường đọc Silver của dashboard một cách ngầm định."
  },
  {
    "id": "question",
    "lane": "ai",
    "col": 0,
    "title": "Câu hỏi & ngữ cảnh",
    "tech": "Preflight · Scope · Thời gian",
    "detail": "Nhận mục tiêu người dùng và phạm vi được cấp; preflight nhận diện dữ liệu và yêu cầu làm rõ.",
    "contract": "Preflight không gọi provider; câu hỏi thiếu dữ kiện thật mới cần hỏi thêm."
  },
  {
    "id": "retrieval",
    "lane": "ai",
    "col": 1,
    "title": "Truy xuất ngữ nghĩa",
    "tech": "Candidate metric / dimension",
    "detail": "Chọn miền, metric và chiều liên quan từ catalog, có giới hạn kích thước packet.",
    "contract": "Không gửi toàn bộ DB hoặc dữ liệu cá nhân cho model; retrieval đúng phải được kiểm riêng."
  },
  {
    "id": "provider",
    "lane": "ai",
    "col": 2,
    "title": "AI hiểu ý",
    "tech": "Intent · Budget · Circuit",
    "detail": "Provider diễn giải câu hỏi thành intent có cấu trúc trong semantics được phép.",
    "contract": "AI không tự quyết định số liệu hoặc sinh SQL được chạy trực tiếp; mọi send nằm trong budget."
  },
  {
    "id": "proposal",
    "lane": "ai",
    "col": 3,
    "title": "Kế hoạch phân tích",
    "tech": "Proposal · Làm rõ · Revision",
    "detail": "Server kiểm intent, lập câu hỏi phân tích và đề xuất phạm vi xử lý.",
    "contract": "Unsupported, thiếu nguồn và implementation gap khác nhau; revision cũ không ghi đè kết quả mới."
  },
  {
    "id": "compiler",
    "lane": "ai",
    "col": 4,
    "title": "Thực thi có kiểm soát",
    "tech": "Compiler · READ ONLY · Snapshot",
    "detail": "Biên dịch truy vấn từ semantic IDs, áp quyền, giới hạn và dùng snapshot nhất quán.",
    "contract": "Model không có credential DB; kết quả phải khớp định nghĩa và bằng chứng truy vấn."
  },
  {
    "id": "report",
    "lane": "ai",
    "col": 5,
    "title": "Report artifact",
    "tech": "KPI · Chart · Evidence",
    "detail": "Đóng gói kết quả, bằng chứng, provenance và giới hạn vào artifact theo revision.",
    "contract": "Số liệu đến từ kết quả truy vấn; số biểu đồ không thay thế coverage hoặc chất lượng."
  },
  {
    "id": "airflow",
    "lane": "control",
    "col": 0,
    "title": "Điều phối",
    "tech": "Airflow · DAG dependencies",
    "detail": "Điều phối ingest_bronze → transform_silver → aggregate_gold → kiểm publication.",
    "contract": "Lịch và retries là cấu hình; màn hình không kích hoạt DAG hoặc đo trạng thái runtime."
  },
  {
    "id": "redis",
    "lane": "control",
    "col": 1,
    "title": "Tác vụ & phiên",
    "tech": "Redis · Lease · CAS · Cancel",
    "detail": "Phối hợp trạng thái job và quyền sở hữu giữa process, hỗ trợ idempotency và cancellation.",
    "contract": "Không âm thầm đổi sang memory riêng khi shared store lỗi; không mất budget ledger."
  },
  {
    "id": "governance",
    "lane": "control",
    "col": 2,
    "title": "Quyền & hợp đồng",
    "tech": "Principal · Allowlist · Audit",
    "detail": "Áp dụng policy, source contract, semantic catalog và redaction ở các bước có truy cập dữ liệu.",
    "contract": "Audit mọi actor không đồng nghĩa cấp mọi actor toàn quyền Analyst."
  },
  {
    "id": "health",
    "lane": "control",
    "col": 3,
    "title": "Chất lượng & lineage",
    "tech": "Checkpoint · Parity · Kỳ đóng",
    "detail": "Giải thích source dependency, lần nạp, lần đối chiếu và kỳ đã được xác nhận.",
    "contract": "Sơ đồ mô tả cấu hình. Health và completeness cần quan sát riêng, không suy từ mũi tên."
  },
  {
    "id": "saved",
    "lane": "control",
    "col": 4,
    "title": "Lưu & mở lại",
    "tech": "Owner · Artifact · Revision",
    "detail": "Lưu artifact và mở lại trong đúng account/policy, giữ provenance cùng kết quả.",
    "contract": "Reopen/refresh phải giữ quyền và định nghĩa; không tự nâng metric cũ hoặc gọi provider."
  },
  {
    "id": "export",
    "lane": "control",
    "col": 5,
    "title": "Xuất & chia sẻ nội bộ",
    "tech": "Word · CSV · Nguồn kiểm chứng",
    "detail": "Xuất nội dung được phép từ report/artifact với cùng công thức, phạm vi và dữ liệu đã xác minh.",
    "contract": "Xuất file không gọi provider; chỉ xuất dữ liệu người dùng có quyền truy cập."
  }
];
export const architectureEdges: ArchitectureEdge[] = [
  {
    "source": "actors",
    "target": "gateway",
    "kind": "data",
    "label": ""
  },
  {
    "source": "gateway",
    "target": "services",
    "kind": "data",
    "label": ""
  },
  {
    "source": "services",
    "target": "source",
    "kind": "data",
    "label": ""
  },
  {
    "source": "replica",
    "target": "rawcopy",
    "kind": "data",
    "label": ""
  },
  {
    "source": "rawcopy",
    "target": "warehouse",
    "kind": "data",
    "label": ""
  },
  {
    "source": "semantic",
    "target": "api",
    "kind": "control",
    "label": "Catalog / policy"
  },
  {
    "source": "api",
    "target": "console",
    "kind": "data",
    "label": ""
  },
  {
    "source": "producer",
    "target": "kafka",
    "kind": "data",
    "label": ""
  },
  {
    "source": "kafka",
    "target": "consumer",
    "kind": "data",
    "label": ""
  },
  {
    "source": "consumer",
    "target": "lake",
    "kind": "data",
    "label": ""
  },
  {
    "source": "batchsnapshot",
    "target": "bronze",
    "kind": "data",
    "label": ""
  },
  {
    "source": "bronze",
    "target": "compute",
    "kind": "data",
    "label": ""
  },
  {
    "source": "compute",
    "target": "silverlake",
    "kind": "data",
    "label": ""
  },
  {
    "source": "silverlake",
    "target": "gold",
    "kind": "data",
    "label": ""
  },
  {
    "source": "gold",
    "target": "publish",
    "kind": "data",
    "label": ""
  },
  {
    "source": "question",
    "target": "retrieval",
    "kind": "data",
    "label": ""
  },
  {
    "source": "retrieval",
    "target": "provider",
    "kind": "data",
    "label": ""
  },
  {
    "source": "provider",
    "target": "proposal",
    "kind": "data",
    "label": ""
  },
  {
    "source": "proposal",
    "target": "compiler",
    "kind": "data",
    "label": ""
  },
  {
    "source": "compiler",
    "target": "report",
    "kind": "data",
    "label": ""
  },
  {
    "source": "source",
    "target": "replica",
    "kind": "data",
    "label": "Nguồn chỉ đọc"
  },
  {
    "source": "source",
    "target": "producer",
    "kind": "data",
    "label": "Polling có cursor"
  },
  {
    "source": "source",
    "target": "batchsnapshot",
    "kind": "data",
    "label": "Snapshot có contract"
  },
  {
    "source": "services",
    "target": "commerce",
    "kind": "control",
    "label": "Tích hợp AI bán hàng"
  },
  {
    "source": "commerce",
    "target": "source",
    "kind": "control",
    "label": "Đọc nguồn được phép"
  },
  {
    "source": "console",
    "target": "question",
    "kind": "control",
    "label": "Chỉ workflow AI"
  },
  {
    "source": "semantic",
    "target": "retrieval",
    "kind": "control",
    "label": "Candidate IDs"
  },
  {
    "source": "compiler",
    "target": "warehouse",
    "kind": "control",
    "label": "SQL READ ONLY"
  },
  {
    "source": "airflow",
    "target": "batchsnapshot",
    "kind": "control",
    "label": "Lịch / dependency"
  },
  {
    "source": "airflow",
    "target": "compute",
    "kind": "control",
    "label": "Cùng run identity"
  },
  {
    "source": "redis",
    "target": "api",
    "kind": "control",
    "label": "Job / session"
  },
  {
    "source": "governance",
    "target": "semantic",
    "kind": "control",
    "label": "Policy / catalog"
  },
  {
    "source": "governance",
    "target": "compiler",
    "kind": "control",
    "label": "Quyền / limits"
  },
  {
    "source": "health",
    "target": "warehouse",
    "kind": "control",
    "label": "Proof / quality"
  },
  {
    "source": "consumer",
    "target": "quarantine",
    "kind": "exception",
    "label": "Envelope lỗi"
  },
  {
    "source": "report",
    "target": "saved",
    "kind": "data",
    "label": "Lưu artifact"
  },
  {
    "source": "report",
    "target": "export",
    "kind": "data",
    "label": "Xuất kết quả"
  },
  {
    "source": "warehouse",
    "target": "api",
    "kind": "data",
    "label": "Kết quả SQL"
  },
  {
    "source": "warehouse",
    "target": "compiler",
    "kind": "data",
    "label": "Dữ liệu cùng snapshot"
  }
];
