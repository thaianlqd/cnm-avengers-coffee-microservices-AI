--
-- PostgreSQL database dump
--

\restrict 4J9mkoqcDlddZgBhwYAQratKECzYOn4IgWh83Pthoh8w1BgCjJDIaz7Y133oRYY

-- Dumped from database version 16.13 (Debian 16.13-1.pgdg13+1)
-- Dumped by pg_dump version 16.13 (Debian 16.13-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: identity; Type: SCHEMA; Schema: -; Owner: admin
--

CREATE SCHEMA identity;


ALTER SCHEMA identity OWNER TO admin;

--
-- Name: inventory; Type: SCHEMA; Schema: -; Owner: admin
--

CREATE SCHEMA inventory;


ALTER SCHEMA inventory OWNER TO admin;

--
-- Name: menu; Type: SCHEMA; Schema: -; Owner: admin
--

CREATE SCHEMA menu;


ALTER SCHEMA menu OWNER TO admin;

--
-- Name: orders; Type: SCHEMA; Schema: -; Owner: admin
--

CREATE SCHEMA orders;


ALTER SCHEMA orders OWNER TO admin;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: admin
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO admin;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: admin
--

COMMENT ON SCHEMA public IS '';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: dia_chi_giao_hang; Type: TABLE; Schema: identity; Owner: admin
--

CREATE TABLE identity.dia_chi_giao_hang (
    id integer NOT NULL,
    ma_nguoi_dung uuid NOT NULL,
    ten_dia_chi character varying NOT NULL,
    dia_chi_day_du text NOT NULL,
    ghi_chu text,
    mac_dinh boolean DEFAULT false NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE identity.dia_chi_giao_hang OWNER TO admin;

--
-- Name: dia_chi_giao_hang_id_seq; Type: SEQUENCE; Schema: identity; Owner: admin
--

CREATE SEQUENCE identity.dia_chi_giao_hang_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE identity.dia_chi_giao_hang_id_seq OWNER TO admin;

--
-- Name: dia_chi_giao_hang_id_seq; Type: SEQUENCE OWNED BY; Schema: identity; Owner: admin
--

ALTER SEQUENCE identity.dia_chi_giao_hang_id_seq OWNED BY identity.dia_chi_giao_hang.id;


--
-- Name: nguoi_dung; Type: TABLE; Schema: identity; Owner: admin
--

CREATE TABLE identity.nguoi_dung (
    ma_nguoi_dung uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ten_dang_nhap character varying NOT NULL,
    mat_khau_hash character varying NOT NULL,
    ho_ten character varying NOT NULL,
    email character varying,
    so_dien_thoai character varying,
    avatar_url character varying,
    trang_thai character varying DEFAULT 'ACTIVE'::character varying NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    diem_loyalty integer DEFAULT 0 NOT NULL
);


ALTER TABLE identity.nguoi_dung OWNER TO admin;

--
-- Name: ton_kho_san_pham; Type: TABLE; Schema: inventory; Owner: admin
--

CREATE TABLE inventory.ton_kho_san_pham (
    id integer NOT NULL,
    ma_san_pham integer NOT NULL,
    so_luong_ton integer DEFAULT 0 NOT NULL,
    muc_canh_bao integer DEFAULT 0 NOT NULL,
    dang_kinh_doanh boolean DEFAULT true NOT NULL,
    cap_nhat_luc timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE inventory.ton_kho_san_pham OWNER TO admin;

--
-- Name: ton_kho_san_pham_id_seq; Type: SEQUENCE; Schema: inventory; Owner: admin
--

CREATE SEQUENCE inventory.ton_kho_san_pham_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE inventory.ton_kho_san_pham_id_seq OWNER TO admin;

--
-- Name: ton_kho_san_pham_id_seq; Type: SEQUENCE OWNED BY; Schema: inventory; Owner: admin
--

ALTER SEQUENCE inventory.ton_kho_san_pham_id_seq OWNED BY inventory.ton_kho_san_pham.id;


--
-- Name: danh_muc; Type: TABLE; Schema: menu; Owner: admin
--

CREATE TABLE menu.danh_muc (
    ma_danh_muc integer NOT NULL,
    ten_danh_muc character varying NOT NULL,
    hinh_anh_icon character varying
);


ALTER TABLE menu.danh_muc OWNER TO admin;

--
-- Name: danh_muc_ma_danh_muc_seq; Type: SEQUENCE; Schema: menu; Owner: admin
--

CREATE SEQUENCE menu.danh_muc_ma_danh_muc_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE menu.danh_muc_ma_danh_muc_seq OWNER TO admin;

--
-- Name: danh_muc_ma_danh_muc_seq; Type: SEQUENCE OWNED BY; Schema: menu; Owner: admin
--

ALTER SEQUENCE menu.danh_muc_ma_danh_muc_seq OWNED BY menu.danh_muc.ma_danh_muc;


--
-- Name: san_pham; Type: TABLE; Schema: menu; Owner: admin
--

CREATE TABLE menu.san_pham (
    ma_san_pham integer NOT NULL,
    ten_san_pham character varying NOT NULL,
    gia_ban numeric(10,2) NOT NULL,
    mo_ta text,
    hinh_anh_url character varying,
    trang_thai boolean DEFAULT true NOT NULL,
    ma_danh_muc integer
);


ALTER TABLE menu.san_pham OWNER TO admin;

--
-- Name: san_pham_ma_san_pham_seq; Type: SEQUENCE; Schema: menu; Owner: admin
--

CREATE SEQUENCE menu.san_pham_ma_san_pham_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE menu.san_pham_ma_san_pham_seq OWNER TO admin;

--
-- Name: san_pham_ma_san_pham_seq; Type: SEQUENCE OWNED BY; Schema: menu; Owner: admin
--

ALTER SEQUENCE menu.san_pham_ma_san_pham_seq OWNED BY menu.san_pham.ma_san_pham;


--
-- Name: chi_tiet_don_hang; Type: TABLE; Schema: orders; Owner: admin
--

CREATE TABLE orders.chi_tiet_don_hang (
    id integer NOT NULL,
    ma_don_hang uuid NOT NULL,
    ma_san_pham integer NOT NULL,
    ten_san_pham character varying NOT NULL,
    gia_ban numeric(12,2) NOT NULL,
    so_luong integer DEFAULT 1 NOT NULL,
    kich_co character varying,
    hinh_anh_url character varying
);


ALTER TABLE orders.chi_tiet_don_hang OWNER TO admin;

--
-- Name: chi_tiet_don_hang_id_seq; Type: SEQUENCE; Schema: orders; Owner: admin
--

CREATE SEQUENCE orders.chi_tiet_don_hang_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE orders.chi_tiet_don_hang_id_seq OWNER TO admin;

--
-- Name: chi_tiet_don_hang_id_seq; Type: SEQUENCE OWNED BY; Schema: orders; Owner: admin
--

ALTER SEQUENCE orders.chi_tiet_don_hang_id_seq OWNED BY orders.chi_tiet_don_hang.id;


--
-- Name: danh_gia_san_pham; Type: TABLE; Schema: orders; Owner: admin
--

CREATE TABLE orders.danh_gia_san_pham (
    id integer NOT NULL,
    ma_san_pham character varying(64) NOT NULL,
    ma_nguoi_dung uuid NOT NULL,
    so_sao integer NOT NULL,
    binh_luan text,
    ma_don_hang uuid,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE orders.danh_gia_san_pham OWNER TO admin;

--
-- Name: danh_gia_san_pham_id_seq; Type: SEQUENCE; Schema: orders; Owner: admin
--

CREATE SEQUENCE orders.danh_gia_san_pham_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE orders.danh_gia_san_pham_id_seq OWNER TO admin;

--
-- Name: danh_gia_san_pham_id_seq; Type: SEQUENCE OWNED BY; Schema: orders; Owner: admin
--

ALTER SEQUENCE orders.danh_gia_san_pham_id_seq OWNED BY orders.danh_gia_san_pham.id;


--
-- Name: don_hang; Type: TABLE; Schema: orders; Owner: admin
--

CREATE TABLE orders.don_hang (
    ma_don_hang uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ma_nguoi_dung character varying NOT NULL,
    tong_tien numeric(12,2) NOT NULL,
    dia_chi_giao_hang character varying NOT NULL,
    khung_gio_giao character varying,
    ghi_chu text,
    phuong_thuc_thanh_toan character varying NOT NULL,
    trang_thai_thanh_toan character varying DEFAULT 'CHO_THANH_TOAN'::character varying NOT NULL,
    trang_thai_don_hang character varying DEFAULT 'MOI_TAO'::character varying NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL,
    lich_su_trang_thai jsonb DEFAULT '[]'::jsonb NOT NULL,
    ma_voucher character varying,
    so_tien_giam numeric(12,2) DEFAULT '0'::numeric
);


ALTER TABLE orders.don_hang OWNER TO admin;

--
-- Name: giao_dich_thanh_toan; Type: TABLE; Schema: orders; Owner: admin
--

CREATE TABLE orders.giao_dich_thanh_toan (
    ma_giao_dich integer NOT NULL,
    ma_don_hang uuid NOT NULL,
    cong_thanh_toan character varying NOT NULL,
    ma_tham_chieu character varying NOT NULL,
    ma_giao_dich_cong character varying,
    so_tien numeric(12,2) NOT NULL,
    trang_thai character varying DEFAULT 'KHOI_TAO'::character varying NOT NULL,
    du_lieu_tho text,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE orders.giao_dich_thanh_toan OWNER TO admin;

--
-- Name: giao_dich_thanh_toan_ma_giao_dich_seq; Type: SEQUENCE; Schema: orders; Owner: admin
--

CREATE SEQUENCE orders.giao_dich_thanh_toan_ma_giao_dich_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE orders.giao_dich_thanh_toan_ma_giao_dich_seq OWNER TO admin;

--
-- Name: giao_dich_thanh_toan_ma_giao_dich_seq; Type: SEQUENCE OWNED BY; Schema: orders; Owner: admin
--

ALTER SEQUENCE orders.giao_dich_thanh_toan_ma_giao_dich_seq OWNED BY orders.giao_dich_thanh_toan.ma_giao_dich;


--
-- Name: gio_hang; Type: TABLE; Schema: orders; Owner: admin
--

CREATE TABLE orders.gio_hang (
    id integer NOT NULL,
    ma_nguoi_dung character varying NOT NULL,
    ma_san_pham integer NOT NULL,
    ten_san_pham character varying NOT NULL,
    gia_ban numeric NOT NULL,
    hinh_anh_url character varying NOT NULL,
    so_luong integer DEFAULT 1 NOT NULL,
    kich_co character varying DEFAULT 'Nhỏ'::character varying NOT NULL
);


ALTER TABLE orders.gio_hang OWNER TO admin;

--
-- Name: gio_hang_id_seq; Type: SEQUENCE; Schema: orders; Owner: admin
--

CREATE SEQUENCE orders.gio_hang_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE orders.gio_hang_id_seq OWNER TO admin;

--
-- Name: gio_hang_id_seq; Type: SEQUENCE OWNED BY; Schema: orders; Owner: admin
--

ALTER SEQUENCE orders.gio_hang_id_seq OWNED BY orders.gio_hang.id;


--
-- Name: thong_bao; Type: TABLE; Schema: orders; Owner: admin
--

CREATE TABLE orders.thong_bao (
    id integer NOT NULL,
    ma_nguoi_dung character varying(64) NOT NULL,
    tieu_de character varying(120) NOT NULL,
    noi_dung text NOT NULL,
    loai character varying(20) DEFAULT 'SYSTEM'::character varying NOT NULL,
    da_doc boolean DEFAULT false NOT NULL,
    du_lieu jsonb,
    ngay_tao timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE orders.thong_bao OWNER TO admin;

--
-- Name: thong_bao_id_seq; Type: SEQUENCE; Schema: orders; Owner: admin
--

CREATE SEQUENCE orders.thong_bao_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE orders.thong_bao_id_seq OWNER TO admin;

--
-- Name: thong_bao_id_seq; Type: SEQUENCE OWNED BY; Schema: orders; Owner: admin
--

ALTER SEQUENCE orders.thong_bao_id_seq OWNED BY orders.thong_bao.id;


--
-- Name: voucher; Type: TABLE; Schema: orders; Owner: admin
--

CREATE TABLE orders.voucher (
    id integer NOT NULL,
    ma_voucher character varying NOT NULL,
    mo_ta text,
    loai character varying DEFAULT 'AMOUNT'::character varying NOT NULL,
    gia_tri numeric(12,2) NOT NULL,
    giam_toi_da numeric(12,2),
    don_hang_toi_thieu numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    tong_luot_dung integer,
    luot_da_dung integer DEFAULT 0 NOT NULL,
    han_su_dung timestamp without time zone,
    trang_thai character varying DEFAULT 'ACTIVE'::character varying NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE orders.voucher OWNER TO admin;

--
-- Name: voucher_id_seq; Type: SEQUENCE; Schema: orders; Owner: admin
--

CREATE SEQUENCE orders.voucher_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE orders.voucher_id_seq OWNER TO admin;

--
-- Name: voucher_id_seq; Type: SEQUENCE OWNED BY; Schema: orders; Owner: admin
--

ALTER SEQUENCE orders.voucher_id_seq OWNED BY orders.voucher.id;


--
-- Name: dia_chi_giao_hang id; Type: DEFAULT; Schema: identity; Owner: admin
--

ALTER TABLE ONLY identity.dia_chi_giao_hang ALTER COLUMN id SET DEFAULT nextval('identity.dia_chi_giao_hang_id_seq'::regclass);


--
-- Name: ton_kho_san_pham id; Type: DEFAULT; Schema: inventory; Owner: admin
--

ALTER TABLE ONLY inventory.ton_kho_san_pham ALTER COLUMN id SET DEFAULT nextval('inventory.ton_kho_san_pham_id_seq'::regclass);


--
-- Name: danh_muc ma_danh_muc; Type: DEFAULT; Schema: menu; Owner: admin
--

ALTER TABLE ONLY menu.danh_muc ALTER COLUMN ma_danh_muc SET DEFAULT nextval('menu.danh_muc_ma_danh_muc_seq'::regclass);


--
-- Name: san_pham ma_san_pham; Type: DEFAULT; Schema: menu; Owner: admin
--

ALTER TABLE ONLY menu.san_pham ALTER COLUMN ma_san_pham SET DEFAULT nextval('menu.san_pham_ma_san_pham_seq'::regclass);


--
-- Name: chi_tiet_don_hang id; Type: DEFAULT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.chi_tiet_don_hang ALTER COLUMN id SET DEFAULT nextval('orders.chi_tiet_don_hang_id_seq'::regclass);


--
-- Name: danh_gia_san_pham id; Type: DEFAULT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.danh_gia_san_pham ALTER COLUMN id SET DEFAULT nextval('orders.danh_gia_san_pham_id_seq'::regclass);


--
-- Name: giao_dich_thanh_toan ma_giao_dich; Type: DEFAULT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.giao_dich_thanh_toan ALTER COLUMN ma_giao_dich SET DEFAULT nextval('orders.giao_dich_thanh_toan_ma_giao_dich_seq'::regclass);


--
-- Name: gio_hang id; Type: DEFAULT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.gio_hang ALTER COLUMN id SET DEFAULT nextval('orders.gio_hang_id_seq'::regclass);


--
-- Name: thong_bao id; Type: DEFAULT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.thong_bao ALTER COLUMN id SET DEFAULT nextval('orders.thong_bao_id_seq'::regclass);


--
-- Name: voucher id; Type: DEFAULT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.voucher ALTER COLUMN id SET DEFAULT nextval('orders.voucher_id_seq'::regclass);


--
-- Data for Name: dia_chi_giao_hang; Type: TABLE DATA; Schema: identity; Owner: admin
--

INSERT INTO identity.dia_chi_giao_hang (id, ma_nguoi_dung, ten_dia_chi, dia_chi_day_du, ghi_chu, mac_dinh, ngay_tao, ngay_cap_nhat) VALUES (1, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'KTX', 'KTX Khu A, Dai hoc Cong nghe Moi a', 'Cong A', true, '2026-03-12 15:21:22.350935', '2026-03-12 15:24:11.793891');


--
-- Data for Name: nguoi_dung; Type: TABLE DATA; Schema: identity; Owner: admin
--

INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, ngay_tao, diem_loyalty) VALUES ('b81d9738-535e-4475-884d-aeb3b7324f01', 'ankudo1234@gmail.com', '$2b$10$UcsEvq7/J8yalFqTTIPLXOx4fkKrauKK8QrQUGn5FA3ZH89ygtzJa', 'thái an', 'ankudo1234@gmail.com', '0914835112', NULL, 'ACTIVE', '2026-03-11 01:04:42.084098', 63);


--
-- Data for Name: ton_kho_san_pham; Type: TABLE DATA; Schema: inventory; Owner: admin
--



--
-- Data for Name: danh_muc; Type: TABLE DATA; Schema: menu; Owner: admin
--

INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (1, 'Cà phê', '☕');
INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (2, 'Trà', '🍃');
INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (3, 'Đồ ăn', '🍕');


--
-- Data for Name: san_pham; Type: TABLE DATA; Schema: menu; Owner: admin
--

INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc) VALUES (1, 'Cà Phê Sữa Đá', 29000.00, 'Cà phê sữa lạnh thơm ngon', '/images/products/ca-phe-sua-da.jpg', true, 1);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc) VALUES (2, 'Trà Đào Cam Sả', 45000.00, 'Trà đào thơm mát, tươi mới', '/images/products/tra-dao-cam-sa.jpg', true, 2);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc) VALUES (3, 'Pizza 5 Cheese', 39000.00, 'Pizza 5 loại phô mai thơm ngon', '/images/products/pizza-5-cheese.jpg', true, 3);


--
-- Data for Name: chi_tiet_don_hang; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (1, '67d5c940-db11-413c-8002-c24459791e56', 1, 'Ca phe sua da', 29000.00, 2, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (2, '04006e27-4b6f-46e5-bfc4-81c9d1e863aa', 2, 'Tra dao cam sa', 45000.00, 1, NULL, '/images/products/tra-dao-cam-sa.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (3, '15cbcdbb-5daa-4589-b3f9-6e7d577d1657', 3, 'Pizza 5 cheese', 39000.00, 1, NULL, '/images/products/pizza-5-cheese.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (4, 'ea92c925-29e3-4a31-b5ee-5d76e0ea6b12', 3, 'Pizza 5 Cheese', 39000.00, 1, NULL, '/images/products/pizza-5-cheese.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (5, 'ea92c925-29e3-4a31-b5ee-5d76e0ea6b12', 1, 'Cà Phê Sữa Đá', 29000.00, 2, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (6, '889ffc32-efbd-42d0-b385-d7655b8f814b', 1, 'Cà Phê Sữa Đá', 29000.00, 2, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (7, '33ac0b31-daa5-47c4-a682-b470e65589e9', 1, 'Ca phe sua da', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (8, '8ec2eae5-c9c9-4cb4-aef0-9c8ab7a39355', 2, 'Tra dao cam sa', 45000.00, 1, NULL, '/images/products/tra-dao-cam-sa.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (9, '1c13efdf-157f-4765-b161-f25bdab20e9d', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (10, 'd3bddab1-d3ce-4e6f-b02e-29f831eff40c', 1, 'Cà Phê Sữa Đá', 29000.00, 2, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (11, '93664625-15b6-496a-9caf-ee6e1796e2f0', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (12, '5a5a00fe-b5d3-4301-982d-0ce3911be782', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (13, '54983887-5296-47e9-b19e-1f8eb42f24dd', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (14, '41ef361b-0f46-4827-8e9a-b86a576a6f9a', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (15, '0f95cfad-2e3f-4033-9649-6602df8e7b9e', 2, 'Trà Đào Cam Sả', 45000.00, 1, NULL, '/images/products/tra-dao-cam-sa.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (16, '05c3ac69-7d03-4301-aa5f-80a54746499e', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (17, '7c8b47d3-f5a7-4b57-9927-4f1d284bf70f', 1, 'Cà Phê Sữa Đá', 29000.00, 2, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (18, '3af0e9e0-57e1-4ee4-9b73-9a43925f981a', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (19, '3fb7de8c-f408-4bc6-a344-99c56e5be647', 3, 'Pizza 5 Cheese', 39000.00, 1, NULL, '/images/products/pizza-5-cheese.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (20, '3fb7de8c-f408-4bc6-a344-99c56e5be647', 3, 'Pizza 5 Cheese', 39000.00, 1, NULL, '/images/products/pizza-5-cheese.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (21, '287ab743-70f6-4736-bf77-398d2d7f41d1', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (22, '74053014-b8a5-459b-8f11-19bac0a39638', 2, 'Trà Đào Cam Sả', 45000.00, 1, NULL, '/images/products/tra-dao-cam-sa.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (23, 'd04a0c38-3327-4c5b-a4ad-6c9b6dc0f341', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (24, '422e17c4-6224-4400-9e8c-2a38a51d2e6a', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (25, '801cad44-338a-4f11-a16f-23805d572a0c', 1, 'Cà Phê Sữa Đá', 29000.00, 2, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (26, '48dde252-67aa-4618-a7b7-cef888e91dc7', 1, 'Cà Phê Sữa Đá', 29000.00, 2, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (27, '6aecd6c8-0cdb-40ab-8a89-57157bfba254', 1, 'Cà Phê Sữa Đá', 29000.00, 2, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (28, 'a72bb6a1-2625-4706-86a5-c521b3a8770f', 1, 'Cà Phê Sữa Đá', 29000.00, 2, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (29, '9d0d9f4e-0dfe-46c0-bbcb-3fb5896481bc', 1, 'Cà Phê Sữa Đá', 29000.00, 2, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (30, 'b8af3658-b07d-4b4e-8d28-4d6a6af503f0', 1, 'Cà Phê Sữa Đá', 29000.00, 2, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (31, '535bd3f7-0d79-4ace-a456-0e1e5e651147', 1, 'Cà Phê Sữa Đá', 29000.00, 2, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (32, '97d0f5d8-4b45-42a1-a897-bb3ffa89854c', 1, 'Cà Phê Sữa Đá', 29000.00, 2, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (33, '3af948ba-aeb9-45ef-a72e-41d89b8ec721', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (34, 'e6dcc532-1c3d-4236-b92b-87a772192a71', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (35, '4c0f27a7-34f6-4847-8b4b-626d48222722', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (36, 'da938a16-1f00-484d-8319-8d94378c8561', 1, 'Cà Phê Sữa Đá', 29000.00, 2, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (37, '7b5f6a8c-5f76-45aa-96e0-46d4b173e3a0', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (38, '07cd58ea-d675-4f2b-b012-2dfa051cffdb', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (39, '5b23efc9-2307-4beb-941e-b4681ac5136f', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (40, '4b74c9bc-b0ce-4748-bee0-d8fc1c0e984f', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (41, 'a48546df-9999-4908-8442-6d0ed57c6eb2', 999001, 'Test Timeline Coffee', 45000.00, 1, NULL, 'https://example.com/test.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (42, '293d7f1f-bb2d-4094-bbb7-8157d81a9c88', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (43, '2e084983-a6b8-4644-8ce7-bbbdb105a568', 1, 'Cà Phê Sữa Đá', 29000.00, 1, 'Nhỏ', '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (44, '3be644c9-1192-4517-9e6d-cf08180e1be6', 1, 'Cà Phê Sữa Đá', 29000.00, 1, 'Nhỏ', '/images/products/ca-phe-sua-da.jpg');


--
-- Data for Name: danh_gia_san_pham; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.danh_gia_san_pham (id, ma_san_pham, ma_nguoi_dung, so_sao, binh_luan, ma_don_hang, ngay_tao, ngay_cap_nhat) VALUES (1, '00000000-0000-0000-0000-000000000001', 'b81d9738-535e-4475-884d-aeb3b7324f01', 4, 'Test qua gateway ok', NULL, '2026-03-12 15:49:20.189312', '2026-03-12 16:05:55.724029');
INSERT INTO orders.danh_gia_san_pham (id, ma_san_pham, ma_nguoi_dung, so_sao, binh_luan, ma_don_hang, ngay_tao, ngay_cap_nhat) VALUES (2, '1', 'b81d9738-535e-4475-884d-aeb3b7324f01', 5, 'ok nhe', '293d7f1f-bb2d-4094-bbb7-8157d81a9c88', '2026-03-12 16:23:04.868871', '2026-03-12 16:24:20.105638');


--
-- Data for Name: don_hang; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('67d5c940-db11-413c-8002-c24459791e56', 'guest-test-001', 58000.00, 'KTX A', '18:00-19:00', 'test', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', '2026-03-11 01:48:26.353646', '2026-03-11 01:48:26.353646', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('04006e27-4b6f-46e5-bfc4-81c9d1e863aa', 'guest-test-002', 45000.00, 'Nha rieng', '19:00-20:00', NULL, 'NGAN_HANG_QR', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 01:49:15.476215', '2026-03-11 01:49:15.476215', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('15cbcdbb-5daa-4589-b3f9-6e7d577d1657', 'guest-test-003', 39000.00, 'Le Loi', '20:00-21:00', NULL, 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 01:50:00.300749', '2026-03-11 01:50:00.300749', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('ea92c925-29e3-4a31-b5ee-5d76e0ea6b12', 'b81d9738-535e-4475-884d-aeb3b7324f01', 97000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'DA_THANH_TOAN', 'DA_XAC_NHAN', '2026-03-11 10:30:57.595956', '2026-03-11 10:30:57.782151', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('889ffc32-efbd-42d0-b385-d7655b8f814b', 'b81d9738-535e-4475-884d-aeb3b7324f01', 58000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'DA_THANH_TOAN', 'DA_XAC_NHAN', '2026-03-11 10:31:19.09066', '2026-03-11 10:31:19.187386', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('33ac0b31-daa5-47c4-a682-b470e65589e9', 'guest-prod-001', 29000.00, 'KTX', '18:00-19:00', NULL, 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 10:54:29.000206', '2026-03-11 10:54:29.000206', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('8ec2eae5-c9c9-4cb4-aef0-9c8ab7a39355', 'guest-prod-002', 45000.00, 'Nha rieng', '19:00-20:00', NULL, 'NGAN_HANG_QR', 'DA_THANH_TOAN', 'DA_XAC_NHAN', '2026-03-11 10:55:27.786322', '2026-03-11 10:55:27.83497', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('1c13efdf-157f-4765-b161-f25bdab20e9d', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 10:56:49.96357', '2026-03-11 10:56:49.96357', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('d3bddab1-d3ce-4e6f-b02e-29f831eff40c', 'b81d9738-535e-4475-884d-aeb3b7324f01', 58000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 10:57:15.823921', '2026-03-11 10:57:15.823921', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('93664625-15b6-496a-9caf-ee6e1796e2f0', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 11:11:05.462258', '2026-03-11 11:11:05.462258', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('5a5a00fe-b5d3-4301-982d-0ce3911be782', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 11:13:31.483628', '2026-03-11 11:13:31.483628', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('54983887-5296-47e9-b19e-1f8eb42f24dd', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 11:18:03.278314', '2026-03-11 11:18:03.278314', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('41ef361b-0f46-4827-8e9a-b86a576a6f9a', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 11:22:18.647291', '2026-03-11 11:22:18.647291', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('0f95cfad-2e3f-4033-9649-6602df8e7b9e', 'b81d9738-535e-4475-884d-aeb3b7324f01', 45000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 11:23:09.447338', '2026-03-11 11:23:09.447338', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('05c3ac69-7d03-4301-aa5f-80a54746499e', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 11:28:32.914283', '2026-03-11 11:28:32.914283', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('7c8b47d3-f5a7-4b57-9927-4f1d284bf70f', 'b81d9738-535e-4475-884d-aeb3b7324f01', 58000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 11:30:51.893948', '2026-03-11 11:30:51.893948', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('3af0e9e0-57e1-4ee4-9b73-9a43925f981a', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 11:31:19.673129', '2026-03-11 11:31:19.673129', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('3fb7de8c-f408-4bc6-a344-99c56e5be647', 'b81d9738-535e-4475-884d-aeb3b7324f01', 78000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 11:34:04.004396', '2026-03-11 11:34:04.004396', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('287ab743-70f6-4736-bf77-398d2d7f41d1', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 12:12:26.248643', '2026-03-11 12:12:26.248643', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('74053014-b8a5-459b-8f11-19bac0a39638', 'b81d9738-535e-4475-884d-aeb3b7324f01', 45000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 12:12:43.353012', '2026-03-11 12:12:43.353012', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('d04a0c38-3327-4c5b-a4ad-6c9b6dc0f341', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 12:13:21.315677', '2026-03-11 12:13:21.315677', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('422e17c4-6224-4400-9e8c-2a38a51d2e6a', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 12:32:30.500244', '2026-03-11 12:32:30.500244', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('801cad44-338a-4f11-a16f-23805d572a0c', 'b81d9738-535e-4475-884d-aeb3b7324f01', 58000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 12:36:28.602612', '2026-03-11 12:36:28.602612', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('48dde252-67aa-4618-a7b7-cef888e91dc7', 'b81d9738-535e-4475-884d-aeb3b7324f01', 58000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 12:57:20.770251', '2026-03-11 12:57:20.770251', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('6aecd6c8-0cdb-40ab-8a89-57157bfba254', 'b81d9738-535e-4475-884d-aeb3b7324f01', 58000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 12:59:15.183997', '2026-03-11 12:59:15.183997', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('a72bb6a1-2625-4706-86a5-c521b3a8770f', 'b81d9738-535e-4475-884d-aeb3b7324f01', 58000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 13:02:14.999445', '2026-03-11 13:02:14.999445', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('9d0d9f4e-0dfe-46c0-bbcb-3fb5896481bc', 'b81d9738-535e-4475-884d-aeb3b7324f01', 58000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'VNPAY', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 13:36:45.059132', '2026-03-11 13:36:45.059132', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('b8af3658-b07d-4b4e-8d28-4d6a6af503f0', 'b81d9738-535e-4475-884d-aeb3b7324f01', 58000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 13:37:02.663578', '2026-03-11 13:37:02.663578', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('535bd3f7-0d79-4ace-a456-0e1e5e651147', 'b81d9738-535e-4475-884d-aeb3b7324f01', 58000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 14:28:36.554552', '2026-03-11 14:28:36.554552', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('97d0f5d8-4b45-42a1-a897-bb3ffa89854c', 'b81d9738-535e-4475-884d-aeb3b7324f01', 58000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'CHO_XU_LY', 'MOI_TAO', '2026-03-11 14:29:17.580561', '2026-03-11 14:29:17.580561', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('3af948ba-aeb9-45ef-a72e-41d89b8ec721', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'DA_THANH_TOAN', 'DA_XAC_NHAN', '2026-03-11 14:59:12.884191', '2026-03-11 15:30:46.351586', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('e6dcc532-1c3d-4236-b92b-87a772192a71', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'DA_THANH_TOAN', 'DA_XAC_NHAN', '2026-03-11 15:36:00.120946', '2026-03-11 15:36:31.040414', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('4c0f27a7-34f6-4847-8b4b-626d48222722', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', '2026-03-11 16:06:53.832576', '2026-03-11 16:06:53.832576', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('da938a16-1f00-484d-8319-8d94378c8561', 'b81d9738-535e-4475-884d-aeb3b7324f01', 58000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'CHO_XU_LY', 'MOI_TAO', '2026-03-12 00:52:26.730986', '2026-03-12 00:52:26.730986', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('7b5f6a8c-5f76-45aa-96e0-46d4b173e3a0', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', '2026-03-12 01:10:52.997641', '2026-03-12 01:10:52.997641', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('07cd58ea-d675-4f2b-b012-2dfa051cffdb', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'CHO_XU_LY', 'MOI_TAO', '2026-03-12 03:41:34.85843', '2026-03-12 03:41:34.85843', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('5b23efc9-2307-4beb-941e-b4681ac5136f', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', '2026-03-12 13:59:42.758677', '2026-03-12 13:59:42.758677', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('4b74c9bc-b0ce-4748-bee0-d8fc1c0e984f', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', '2026-03-12 14:12:46.996061', '2026-03-12 14:12:46.996061', '[]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('a48546df-9999-4908-8442-6d0ed57c6eb2', 'b81d9738-535e-4475-884d-aeb3b7324f01', 45000.00, 'Dia chi test timeline', '08:00-09:00', 'smoke test timeline', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'DANG_CHUAN_BI', '2026-03-12 14:27:58.536416', '2026-03-12 14:28:46.006045', '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-12T14:27:58.535Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-12T14:27:58.535Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Cap nhat trang thai don hang", "thoi_gian": "2026-03-12T14:28:45.999Z", "trang_thai": "DANG_CHUAN_BI"}]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('293d7f1f-bb2d-4094-bbb7-8157d81a9c88', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer a', 'THANH_TOAN_KHI_NHAN_HANG', 'THAT_BAI', 'DA_HUY', '2026-03-12 14:35:21.344156', '2026-03-12 14:57:33.337903', '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-12T14:35:21.342Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-12T14:35:21.342Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Khach hang huy don", "thoi_gian": "2026-03-12T14:57:33.334Z", "trang_thai": "DA_HUY"}, {"loai": "PAYMENT", "ghi_chu": "Khach hang huy don", "thoi_gian": "2026-03-12T14:57:33.334Z", "trang_thai": "THAT_BAI"}]', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('2e084983-a6b8-4644-8ce7-bbbdb105a568', 'b81d9738-535e-4475-884d-aeb3b7324f01', 26100.00, 'KTX Khu A, Dai hoc Cong nghe Moi a', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', '2026-03-12 17:49:36.910054', '2026-03-12 17:49:36.910054', '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-12T17:49:36.905Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-12T17:49:36.905Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}]', 'WELCOME10', 2900.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ngay_tao, ngay_cap_nhat, lich_su_trang_thai, ma_voucher, so_tien_giam) VALUES ('3be644c9-1192-4517-9e6d-cf08180e1be6', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi a', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', '2026-03-12 17:56:11.988584', '2026-03-12 17:56:11.988584', '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-12T17:56:11.988Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-12T17:56:11.988Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}]', NULL, 0.00);


--
-- Data for Name: giao_dich_thanh_toan; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (1, '67d5c940-db11-413c-8002-c24459791e56', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-67d5c940-706371', NULL, 58000.00, 'CHO_THU_TIEN', NULL, '2026-03-11 01:48:26.371556');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (2, '04006e27-4b6f-46e5-bfc4-81c9d1e863aa', 'NGAN_HANG_QR', 'QR-04006e27-755484', NULL, 45000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 01:49:15.485106');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (3, '15cbcdbb-5daa-4589-b3f9-6e7d577d1657', 'VNPAY', 'VNP-15cbcdbb-800309', NULL, 39000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 01:50:00.310075');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (4, 'ea92c925-29e3-4a31-b5ee-5d76e0ea6b12', 'VNPAY', 'VNP-ea92c925-057630', 'VNPAY-1773225057764', 97000.00, 'THANH_CONG', '{"ma_don_hang":"ea92c925-29e3-4a31-b5ee-5d76e0ea6b12","thanh_cong":true}', '2026-03-11 10:30:57.631323');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (5, '889ffc32-efbd-42d0-b385-d7655b8f814b', 'VNPAY', 'VNP-889ffc32-079103', 'VNPAY-1773225079177', 58000.00, 'THANH_CONG', '{"ma_don_hang":"889ffc32-efbd-42d0-b385-d7655b8f814b","thanh_cong":true}', '2026-03-11 10:31:19.10398');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (6, '33ac0b31-daa5-47c4-a682-b470e65589e9', 'VNPAY', '33ac0b31-daa5-47c4-a682-b470e65589e9_1773226469026', NULL, 29000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 10:54:29.027403');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (7, '8ec2eae5-c9c9-4cb4-aef0-9c8ab7a39355', 'NGAN_HANG_QR', 'QR-8ec2eae5-527795', 'SEPAY-TXN-0001', 45000.00, 'THANH_CONG', '{"content":"Thanh toan QR-8ec2eae5-527795","transferType":"in","referenceCode":"SEPAY-TXN-0001","transferAmount":45000}', '2026-03-11 10:55:27.796466');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (8, '1c13efdf-157f-4765-b161-f25bdab20e9d', 'VNPAY', '1c13efdf-157f-4765-b161-f25bdab20e9d_1773226609988', NULL, 29000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 10:56:49.989093');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (9, 'd3bddab1-d3ce-4e6f-b02e-29f831eff40c', 'VNPAY', 'd3bddab1-d3ce-4e6f-b02e-29f831eff40c_1773226635859', NULL, 58000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 10:57:15.860041');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (10, '93664625-15b6-496a-9caf-ee6e1796e2f0', 'VNPAY', '93664625-15b6-496a-9caf-ee6e1796e2f0_1773227465512', NULL, 29000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 11:11:05.513673');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (11, '5a5a00fe-b5d3-4301-982d-0ce3911be782', 'VNPAY', '5a5a00fe-b5d3-4301-982d-0ce3911be782_1773227611501', NULL, 29000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 11:13:31.502557');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (12, '54983887-5296-47e9-b19e-1f8eb42f24dd', 'VNPAY', '54983887-5296-47e9-b19e-1f8eb42f24dd_1773227883309', NULL, 29000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 11:18:03.311097');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (13, '41ef361b-0f46-4827-8e9a-b86a576a6f9a', 'NGAN_HANG_QR', 'QR-41ef361b-138670', NULL, 29000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 11:22:18.672281');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (14, '0f95cfad-2e3f-4033-9649-6602df8e7b9e', 'VNPAY', '0f95cfad-2e3f-4033-9649-6602df8e7b9e_1773228189459', NULL, 45000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 11:23:09.460432');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (15, '05c3ac69-7d03-4301-aa5f-80a54746499e', 'VNPAY', '05c3ac69-7d03-4301-aa5f-80a54746499e_1773228512934', NULL, 29000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 11:28:32.935232');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (16, '7c8b47d3-f5a7-4b57-9927-4f1d284bf70f', 'VNPAY', '7c8b47d3-f5a7-4b57-9927-4f1d284bf70f_1773228651919', NULL, 58000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 11:30:51.920333');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (17, '3af0e9e0-57e1-4ee4-9b73-9a43925f981a', 'VNPAY', '3af0e9e0-57e1-4ee4-9b73-9a43925f981a_1773228679685', NULL, 29000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 11:31:19.686674');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (18, '3fb7de8c-f408-4bc6-a344-99c56e5be647', 'VNPAY', '3fb7de8c-f408-4bc6-a344-99c56e5be647_1773228844035', NULL, 78000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 11:34:04.036168');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (19, '287ab743-70f6-4736-bf77-398d2d7f41d1', 'VNPAY', '287ab743-70f6-4736-bf77-398d2d7f41d1_1773231146295', NULL, 29000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 12:12:26.296984');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (20, '74053014-b8a5-459b-8f11-19bac0a39638', 'NGAN_HANG_QR', 'QR-74053014-163391', NULL, 45000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 12:12:43.392616');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (21, 'd04a0c38-3327-4c5b-a4ad-6c9b6dc0f341', 'VNPAY', 'd04a0c38-3327-4c5b-a4ad-6c9b6dc0f341_1773231201326', NULL, 29000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 12:13:21.326658');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (22, '422e17c4-6224-4400-9e8c-2a38a51d2e6a', 'VNPAY', '422e17c4-6224-4400-9e8c-2a38a51d2e6a_1773232350528', NULL, 29000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 12:32:30.529386');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (23, '801cad44-338a-4f11-a16f-23805d572a0c', 'VNPAY', '801cad44-338a-4f11-a16f-23805d572a0c_1773232588638', NULL, 58000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 12:36:28.641441');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (24, '48dde252-67aa-4618-a7b7-cef888e91dc7', 'VNPAY', '48dde252-67aa-4618-a7b7-cef888e91dc7_1773233840821', NULL, 58000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 12:57:20.822519');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (25, '6aecd6c8-0cdb-40ab-8a89-57157bfba254', 'VNPAY', '6aecd6c8-0cdb-40ab-8a89-57157bfba254_1773233955219', NULL, 58000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 12:59:15.220676');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (26, 'a72bb6a1-2625-4706-86a5-c521b3a8770f', 'VNPAY', 'a72bb6a1-2625-4706-86a5-c521b3a8770f_1773234135045', NULL, 58000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 13:02:15.046531');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (27, '9d0d9f4e-0dfe-46c0-bbcb-3fb5896481bc', 'VNPAY', '9d0d9f4e-0dfe-46c0-bbcb-3fb5896481bc_1773236205110', NULL, 58000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 13:36:45.112851');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (28, 'b8af3658-b07d-4b4e-8d28-4d6a6af503f0', 'NGAN_HANG_QR', 'QR-b8af3658-222674', NULL, 58000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 13:37:02.675623');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (29, '535bd3f7-0d79-4ace-a456-0e1e5e651147', 'NGAN_HANG_QR', 'QR-535bd3f7-316595', NULL, 58000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 14:28:36.596697');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (30, '97d0f5d8-4b45-42a1-a897-bb3ffa89854c', 'NGAN_HANG_QR', 'QR-97d0f5d8-357603', NULL, 58000.00, 'CHO_THANH_TOAN', NULL, '2026-03-11 14:29:17.604667');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (31, '3af948ba-aeb9-45ef-a72e-41d89b8ec721', 'NGAN_HANG_QR', 'QR-3af948ba-152903', 'FT26071624475506', 29000.00, 'THANH_CONG', '{"gateway":"MBBank","transactionDate":"2026-03-11 21:59:00","accountNumber":"025452790502","subAccount":null,"code":null,"content":"QR3af948ba152903","transferType":"in","description":"BankAPINotify QR3af948ba152903","transferAmount":29000,"referenceCode":"FT26071624475506","accumulated":210258,"id":44947942}', '2026-03-11 14:59:12.904458');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (32, 'e6dcc532-1c3d-4236-b92b-87a772192a71', 'NGAN_HANG_QR', 'QR-e6dcc532-360167', 'FT26071601004873', 29000.00, 'THANH_CONG', '{"gateway":"MBBank","transactionDate":"2026-03-11 22:36:00","accountNumber":"025452790502","subAccount":null,"code":null,"content":"QRe6dcc532360167","transferType":"in","description":"BankAPINotify QRe6dcc532360167","transferAmount":29000,"referenceCode":"FT26071601004873","accumulated":239258,"id":44951099}', '2026-03-11 15:36:00.169196');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (33, '4c0f27a7-34f6-4847-8b4b-626d48222722', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-4c0f27a7-213860', NULL, 29000.00, 'CHO_THU_TIEN', NULL, '2026-03-11 16:06:53.86257');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (34, 'da938a16-1f00-484d-8319-8d94378c8561', 'NGAN_HANG_QR', 'QR-da938a16-746823', NULL, 58000.00, 'CHO_THANH_TOAN', NULL, '2026-03-12 00:52:26.825179');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (35, '7b5f6a8c-5f76-45aa-96e0-46d4b173e3a0', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-7b5f6a8c-853028', NULL, 29000.00, 'CHO_THU_TIEN', NULL, '2026-03-12 01:10:53.030302');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (36, '07cd58ea-d675-4f2b-b012-2dfa051cffdb', 'NGAN_HANG_QR', 'QR-07cd58ea-894904', NULL, 29000.00, 'CHO_THANH_TOAN', NULL, '2026-03-12 03:41:34.905855');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (37, '5b23efc9-2307-4beb-941e-b4681ac5136f', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-5b23efc9-982814', NULL, 29000.00, 'CHO_THU_TIEN', NULL, '2026-03-12 13:59:42.81563');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (38, '4b74c9bc-b0ce-4748-bee0-d8fc1c0e984f', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-4b74c9bc-767022', NULL, 29000.00, 'CHO_THU_TIEN', NULL, '2026-03-12 14:12:47.02318');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (39, 'a48546df-9999-4908-8442-6d0ed57c6eb2', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-a48546df-678565', NULL, 45000.00, 'CHO_THU_TIEN', NULL, '2026-03-12 14:27:58.565971');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (40, '293d7f1f-bb2d-4094-bbb7-8157d81a9c88', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-293d7f1f-121373', NULL, 29000.00, 'CHO_THU_TIEN', NULL, '2026-03-12 14:35:21.3739');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (41, '2e084983-a6b8-4644-8ce7-bbbdb105a568', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-2e084983-776979', NULL, 26100.00, 'CHO_THU_TIEN', NULL, '2026-03-12 17:49:36.980654');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (42, '3be644c9-1192-4517-9e6d-cf08180e1be6', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-3be644c9-172004', NULL, 29000.00, 'CHO_THU_TIEN', NULL, '2026-03-12 17:56:12.005088');


--
-- Data for Name: gio_hang; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.gio_hang (id, ma_nguoi_dung, ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url, so_luong, kich_co) VALUES (75, 'guest-cart-test-51eb8cd8-872d-404b-ab66-64f8c40b868b', 1, 'Ca phe sua da', 29000, 'https://example.com/a.jpg', 1, 'Nh?');
INSERT INTO orders.gio_hang (id, ma_nguoi_dung, ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url, so_luong, kich_co) VALUES (76, 'guest-cart-test-51eb8cd8-872d-404b-ab66-64f8c40b868b', 1, 'Ca phe sua da', 35000, 'https://example.com/a.jpg', 1, 'V?a');


--
-- Data for Name: thong_bao; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (1, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #5b23efc9-2307-4beb-941e-b4681ac5136f da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "5b23efc9-2307-4beb-941e-b4681ac5136f", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-12 13:59:42.824284+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (2, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #5b23efc9-2307-4beb-941e-b4681ac5136f se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "5b23efc9-2307-4beb-941e-b4681ac5136f", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-12 13:59:42.840698+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (7, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #a48546df-9999-4908-8442-6d0ed57c6eb2 da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', true, '{"ma_don_hang": "a48546df-9999-4908-8442-6d0ed57c6eb2", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-12 14:28:46.017985+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (3, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #4b74c9bc-b0ce-4748-bee0-d8fc1c0e984f da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "4b74c9bc-b0ce-4748-bee0-d8fc1c0e984f", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-12 14:12:47.031232+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (4, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #4b74c9bc-b0ce-4748-bee0-d8fc1c0e984f se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "4b74c9bc-b0ce-4748-bee0-d8fc1c0e984f", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-12 14:12:47.045785+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (5, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #a48546df-9999-4908-8442-6d0ed57c6eb2 da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "a48546df-9999-4908-8442-6d0ed57c6eb2", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-12 14:27:58.573842+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (6, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #a48546df-9999-4908-8442-6d0ed57c6eb2 se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "a48546df-9999-4908-8442-6d0ed57c6eb2", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-12 14:27:58.588388+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (8, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #293d7f1f-bb2d-4094-bbb7-8157d81a9c88 da duoc tao thanh cong.', 'ORDER', false, '{"ma_don_hang": "293d7f1f-bb2d-4094-bbb7-8157d81a9c88", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-12 14:35:21.379542+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (9, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #293d7f1f-bb2d-4094-bbb7-8157d81a9c88 se duoc thu tien khi giao hang.', 'PAYMENT', false, '{"ma_don_hang": "293d7f1f-bb2d-4094-bbb7-8157d81a9c88", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-12 14:35:21.391991+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (10, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc cap nhat', 'Don #293d7f1f-bb2d-4094-bbb7-8157d81a9c88 da duoc chinh sua truoc khi xac nhan.', 'ORDER', false, '{"ma_don_hang": "293d7f1f-bb2d-4094-bbb7-8157d81a9c88", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-12 14:57:23.04998+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (11, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da huy', 'Don #293d7f1f-bb2d-4094-bbb7-8157d81a9c88 da duoc huy.', 'ORDER', false, '{"ma_don_hang": "293d7f1f-bb2d-4094-bbb7-8157d81a9c88", "trang_thai_don_hang": "DA_HUY"}', '2026-03-12 14:57:33.342944+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (12, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #2e084983-a6b8-4644-8ce7-bbbdb105a568 da duoc tao thanh cong. Giam gia: 2.900d', 'ORDER', false, '{"ma_don_hang": "2e084983-a6b8-4644-8ce7-bbbdb105a568", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-12 17:49:37.147728+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (13, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #2e084983-a6b8-4644-8ce7-bbbdb105a568 se duoc thu tien khi giao hang.', 'PAYMENT', false, '{"ma_don_hang": "2e084983-a6b8-4644-8ce7-bbbdb105a568", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-12 17:49:37.245528+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (14, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #3be644c9-1192-4517-9e6d-cf08180e1be6 da duoc tao thanh cong.', 'ORDER', false, '{"ma_don_hang": "3be644c9-1192-4517-9e6d-cf08180e1be6", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-12 17:56:12.008988+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (15, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #3be644c9-1192-4517-9e6d-cf08180e1be6 se duoc thu tien khi giao hang.', 'PAYMENT', false, '{"ma_don_hang": "3be644c9-1192-4517-9e6d-cf08180e1be6", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-12 17:56:12.016692+00');


--
-- Data for Name: voucher; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.voucher (id, ma_voucher, mo_ta, loai, gia_tri, giam_toi_da, don_hang_toi_thieu, tong_luot_dung, luot_da_dung, han_su_dung, trang_thai, ngay_tao, ngay_cap_nhat) VALUES (2, 'SAVE20K', 'Giam thang 20,000d cho don tu 100,000d', 'AMOUNT', 20000.00, NULL, 100000.00, 50, 0, NULL, 'ACTIVE', '2026-03-12 17:38:13.425679', '2026-03-12 17:38:13.425679');
INSERT INTO orders.voucher (id, ma_voucher, mo_ta, loai, gia_tri, giam_toi_da, don_hang_toi_thieu, tong_luot_dung, luot_da_dung, han_su_dung, trang_thai, ngay_tao, ngay_cap_nhat) VALUES (3, 'FREESHIP', 'Giam phi giao hang 15,000d', 'AMOUNT', 15000.00, NULL, 0.00, NULL, 0, NULL, 'ACTIVE', '2026-03-12 17:38:13.425679', '2026-03-12 17:38:13.425679');
INSERT INTO orders.voucher (id, ma_voucher, mo_ta, loai, gia_tri, giam_toi_da, don_hang_toi_thieu, tong_luot_dung, luot_da_dung, han_su_dung, trang_thai, ngay_tao, ngay_cap_nhat) VALUES (1, 'WELCOME10', 'Giam 10% cho don hang dau tien', 'PERCENT', 10.00, 50000.00, 0.00, 100, 1, NULL, 'ACTIVE', '2026-03-12 17:38:13.425679', '2026-03-12 17:49:37.003667');


--
-- Name: dia_chi_giao_hang_id_seq; Type: SEQUENCE SET; Schema: identity; Owner: admin
--

SELECT pg_catalog.setval('identity.dia_chi_giao_hang_id_seq', 1, true);


--
-- Name: ton_kho_san_pham_id_seq; Type: SEQUENCE SET; Schema: inventory; Owner: admin
--

SELECT pg_catalog.setval('inventory.ton_kho_san_pham_id_seq', 1, false);


--
-- Name: danh_muc_ma_danh_muc_seq; Type: SEQUENCE SET; Schema: menu; Owner: admin
--

SELECT pg_catalog.setval('menu.danh_muc_ma_danh_muc_seq', 3, true);


--
-- Name: san_pham_ma_san_pham_seq; Type: SEQUENCE SET; Schema: menu; Owner: admin
--

SELECT pg_catalog.setval('menu.san_pham_ma_san_pham_seq', 3, true);


--
-- Name: chi_tiet_don_hang_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.chi_tiet_don_hang_id_seq', 44, true);


--
-- Name: danh_gia_san_pham_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.danh_gia_san_pham_id_seq', 2, true);


--
-- Name: giao_dich_thanh_toan_ma_giao_dich_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.giao_dich_thanh_toan_ma_giao_dich_seq', 42, true);


--
-- Name: gio_hang_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.gio_hang_id_seq', 89, true);


--
-- Name: thong_bao_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.thong_bao_id_seq', 15, true);


--
-- Name: voucher_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.voucher_id_seq', 3, true);


--
-- Name: dia_chi_giao_hang PK_0bd080c67fa44943dfc6396b270; Type: CONSTRAINT; Schema: identity; Owner: admin
--

ALTER TABLE ONLY identity.dia_chi_giao_hang
    ADD CONSTRAINT "PK_0bd080c67fa44943dfc6396b270" PRIMARY KEY (id);


--
-- Name: nguoi_dung PK_dc056ebc44f20f41b5e7aded3f1; Type: CONSTRAINT; Schema: identity; Owner: admin
--

ALTER TABLE ONLY identity.nguoi_dung
    ADD CONSTRAINT "PK_dc056ebc44f20f41b5e7aded3f1" PRIMARY KEY (ma_nguoi_dung);


--
-- Name: nguoi_dung UQ_2e80e311459160919913afd26c9; Type: CONSTRAINT; Schema: identity; Owner: admin
--

ALTER TABLE ONLY identity.nguoi_dung
    ADD CONSTRAINT "UQ_2e80e311459160919913afd26c9" UNIQUE (email);


--
-- Name: nguoi_dung UQ_4c3e9c0cb61608aa73e173316cb; Type: CONSTRAINT; Schema: identity; Owner: admin
--

ALTER TABLE ONLY identity.nguoi_dung
    ADD CONSTRAINT "UQ_4c3e9c0cb61608aa73e173316cb" UNIQUE (so_dien_thoai);


--
-- Name: nguoi_dung UQ_7de638388c030187907e065fe6d; Type: CONSTRAINT; Schema: identity; Owner: admin
--

ALTER TABLE ONLY identity.nguoi_dung
    ADD CONSTRAINT "UQ_7de638388c030187907e065fe6d" UNIQUE (ten_dang_nhap);


--
-- Name: ton_kho_san_pham PK_b1794f4d5a33ad03a9b6e4a5cdf; Type: CONSTRAINT; Schema: inventory; Owner: admin
--

ALTER TABLE ONLY inventory.ton_kho_san_pham
    ADD CONSTRAINT "PK_b1794f4d5a33ad03a9b6e4a5cdf" PRIMARY KEY (id);


--
-- Name: ton_kho_san_pham UQ_9962ac0d59222e35ec19b07ccb0; Type: CONSTRAINT; Schema: inventory; Owner: admin
--

ALTER TABLE ONLY inventory.ton_kho_san_pham
    ADD CONSTRAINT "UQ_9962ac0d59222e35ec19b07ccb0" UNIQUE (ma_san_pham);


--
-- Name: san_pham PK_12500fa438f405e740de57e0f8e; Type: CONSTRAINT; Schema: menu; Owner: admin
--

ALTER TABLE ONLY menu.san_pham
    ADD CONSTRAINT "PK_12500fa438f405e740de57e0f8e" PRIMARY KEY (ma_san_pham);


--
-- Name: danh_muc PK_e6a452a9f1b206531f8a59158e9; Type: CONSTRAINT; Schema: menu; Owner: admin
--

ALTER TABLE ONLY menu.danh_muc
    ADD CONSTRAINT "PK_e6a452a9f1b206531f8a59158e9" PRIMARY KEY (ma_danh_muc);


--
-- Name: thong_bao PK_0598b77d7c5991cb28f43c14f4e; Type: CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.thong_bao
    ADD CONSTRAINT "PK_0598b77d7c5991cb28f43c14f4e" PRIMARY KEY (id);


--
-- Name: danh_gia_san_pham PK_17c1931906d038cc3914157220a; Type: CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.danh_gia_san_pham
    ADD CONSTRAINT "PK_17c1931906d038cc3914157220a" PRIMARY KEY (id);


--
-- Name: gio_hang PK_40a78fdbcb9b367d66290748c4a; Type: CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.gio_hang
    ADD CONSTRAINT "PK_40a78fdbcb9b367d66290748c4a" PRIMARY KEY (id);


--
-- Name: voucher PK_677ae75f380e81c2f103a57ffaf; Type: CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.voucher
    ADD CONSTRAINT "PK_677ae75f380e81c2f103a57ffaf" PRIMARY KEY (id);


--
-- Name: giao_dich_thanh_toan PK_b02dabd4711cbe14c063edbfa18; Type: CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.giao_dich_thanh_toan
    ADD CONSTRAINT "PK_b02dabd4711cbe14c063edbfa18" PRIMARY KEY (ma_giao_dich);


--
-- Name: don_hang PK_b81d18b74cee882d3a93f9f5b01; Type: CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.don_hang
    ADD CONSTRAINT "PK_b81d18b74cee882d3a93f9f5b01" PRIMARY KEY (ma_don_hang);


--
-- Name: chi_tiet_don_hang PK_d7fe4a8788051af44dbab9a6a34; Type: CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.chi_tiet_don_hang
    ADD CONSTRAINT "PK_d7fe4a8788051af44dbab9a6a34" PRIMARY KEY (id);


--
-- Name: voucher UQ_307ad3ced1467c166ed716c82a6; Type: CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.voucher
    ADD CONSTRAINT "UQ_307ad3ced1467c166ed716c82a6" UNIQUE (ma_voucher);


--
-- Name: giao_dich_thanh_toan UQ_82533d925a908930be234fcac00; Type: CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.giao_dich_thanh_toan
    ADD CONSTRAINT "UQ_82533d925a908930be234fcac00" UNIQUE (ma_tham_chieu);


--
-- Name: san_pham FK_ab26c1b5e6d62d0527e72b20def; Type: FK CONSTRAINT; Schema: menu; Owner: admin
--

ALTER TABLE ONLY menu.san_pham
    ADD CONSTRAINT "FK_ab26c1b5e6d62d0527e72b20def" FOREIGN KEY (ma_danh_muc) REFERENCES menu.danh_muc(ma_danh_muc);


--
-- Name: chi_tiet_don_hang FK_6ec7e7849311b2cf931302d2bb4; Type: FK CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.chi_tiet_don_hang
    ADD CONSTRAINT "FK_6ec7e7849311b2cf931302d2bb4" FOREIGN KEY (ma_don_hang) REFERENCES orders.don_hang(ma_don_hang) ON DELETE CASCADE;


--
-- Name: giao_dich_thanh_toan FK_ffeb5cf0f700e921f6cdac43475; Type: FK CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.giao_dich_thanh_toan
    ADD CONSTRAINT "FK_ffeb5cf0f700e921f6cdac43475" FOREIGN KEY (ma_don_hang) REFERENCES orders.don_hang(ma_don_hang) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: admin
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict 4J9mkoqcDlddZgBhwYAQratKECzYOn4IgWh83Pthoh8w1BgCjJDIaz7Y133oRYY

