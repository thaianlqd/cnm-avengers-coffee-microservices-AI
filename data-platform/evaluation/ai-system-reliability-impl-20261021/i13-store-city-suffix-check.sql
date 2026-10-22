WITH norm AS (SELECT 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ'::text AS a, 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'::text AS b),
c AS MATERIALIZED (SELECT DISTINCT thanh_pho AS city, translate(lower(thanh_pho), norm.a, norm.b) AS k FROM silver.chi_nhanh, norm WHERE thanh_pho IS NOT NULL),
s AS MATERIALIZED (SELECT thanh_pho, translate(lower(ten_chi_nhanh), norm.a, norm.b) AS n FROM silver.chi_nhanh, norm)
SELECT COUNT(*) AS checked, COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM c WHERE c.city IS DISTINCT FROM s.thanh_pho AND length(c.k) >= 6 AND rtrim(s.n) LIKE '%' || c.k)) AS violations FROM s
