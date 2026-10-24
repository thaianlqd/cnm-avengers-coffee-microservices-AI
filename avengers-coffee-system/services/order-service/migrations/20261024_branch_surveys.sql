-- NULL is a system survey; a branch code is a manager-owned branch survey.
ALTER TABLE orders.khao_sat_bieu_mau ADD COLUMN IF NOT EXISTS co_so_ma varchar NULL;
CREATE INDEX IF NOT EXISTS survey_form_branch_idx ON orders.khao_sat_bieu_mau (co_so_ma, trang_thai);
