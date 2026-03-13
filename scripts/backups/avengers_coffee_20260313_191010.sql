--
-- PostgreSQL database dump
--

\restrict 4EgvKucBZhmxiNG5zw0qxQrHIVbCx8YawqfH0WQz6jatMZ9DLOxSBEgOFX86g5f

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
    diem_loyalty integer DEFAULT 0 NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL
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
    ma_voucher character varying,
    so_tien_giam numeric(12,2) DEFAULT '0'::numeric,
    lich_su_trang_thai jsonb DEFAULT '[]'::jsonb NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL
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
    kich_co character varying DEFAULT 'Nhỏ'::character varying NOT NULL,
    so_luong integer DEFAULT 1 NOT NULL
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

INSERT INTO identity.dia_chi_giao_hang (id, ma_nguoi_dung, ten_dia_chi, dia_chi_day_du, ghi_chu, mac_dinh, ngay_tao, ngay_cap_nhat) VALUES (1, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'KTX', 'KTX Khu A, Dai hoc Cong nghe Moi aaaa', 'Cong A', true, '2026-03-12 15:21:22.350935', '2026-03-13 11:24:50.762079');


--
-- Data for Name: nguoi_dung; Type: TABLE DATA; Schema: identity; Owner: admin
--

INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao) VALUES ('e4085f96-bc91-412e-8bcc-2b529703c64d', 'fix86749@mail.com', '$2b$10$Br8iRwT9qBnECpfTBxDEPeKzVATbv7L/aAeSXE7mpPabR/UZ7ic/2', 'Fix User', 'fix86749@mail.com', NULL, NULL, 'ACTIVE', 0, '2026-03-13 11:59:45.732631');
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao) VALUES ('b81d9738-535e-4475-884d-aeb3b7324f01', 'ankudo1234@gmail.com', '$2b$10$xoSioJl570SGMsVvVtt8ku69HBhXhI9kVfdxzNr1pxPhe/OkYn1aq', 'thái an', 'ankudo1234@gmail.com', '0914835114', NULL, 'ACTIVE', 121, '2026-03-11 01:04:42.084098');
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao) VALUES ('27fbca00-a226-4d07-b331-e3c34cd0f63c', 'thanhan@gmail.com', '$2b$10$EKlQiWhSDjS2v/vz0zhbVeVFLniMyZd8wa09mR6xK1jHxzQqR8dGO', 'thanh an', 'thanhan@gmail.com', NULL, NULL, 'ACTIVE', 29, '2026-03-13 12:05:44.570514');


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

INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (45, '2ff31732-491d-46ad-af06-5948e1a51387', 1, 'Cà Phê Sữa Đá', 29000.00, 1, 'Nhỏ', '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (46, '2ff31732-491d-46ad-af06-5948e1a51387', 1, 'Test Coffee', 29000.00, 1, 'Nh?', 'https://example.com/a.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (47, '0be27c43-8933-45bc-8ef9-b4d6856098cc', 1, 'Cà Phê Sữa Đá', 29000.00, 1, 'Nhỏ', '/images/products/ca-phe-sua-da.jpg');


--
-- Data for Name: danh_gia_san_pham; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.danh_gia_san_pham (id, ma_san_pham, ma_nguoi_dung, so_sao, binh_luan, ma_don_hang, ngay_tao, ngay_cap_nhat) VALUES (1, '00000000-0000-0000-0000-000000000001', 'b81d9738-535e-4475-884d-aeb3b7324f01', 4, 'Test qua gateway ok', NULL, '2026-03-12 15:49:20.189312', '2026-03-12 16:05:55.724029');
INSERT INTO orders.danh_gia_san_pham (id, ma_san_pham, ma_nguoi_dung, so_sao, binh_luan, ma_don_hang, ngay_tao, ngay_cap_nhat) VALUES (2, '1', 'b81d9738-535e-4475-884d-aeb3b7324f01', 5, 'ok nhe', '293d7f1f-bb2d-4094-bbb7-8157d81a9c88', '2026-03-12 16:23:04.868871', '2026-03-12 16:24:20.105638');
INSERT INTO orders.danh_gia_san_pham (id, ma_san_pham, ma_nguoi_dung, so_sao, binh_luan, ma_don_hang, ngay_tao, ngay_cap_nhat) VALUES (3, '1', '27fbca00-a226-4d07-b331-e3c34cd0f63c', 5, 'ok', '0be27c43-8933-45bc-8ef9-b4d6856098cc', '2026-03-13 12:06:17.306794', '2026-03-13 12:06:17.306794');


--
-- Data for Name: don_hang; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat) VALUES ('2ff31732-491d-46ad-af06-5948e1a51387', 'b81d9738-535e-4475-884d-aeb3b7324f01', 58000.00, 'KTX Khu A, Dai hoc Cong nghe Moi a', '18:00 - 19:00', 'test', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-13T11:59:57.327Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-13T11:59:57.327Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}]', '2026-03-13 11:59:57.331911', '2026-03-13 11:59:57.331911');
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat) VALUES ('0be27c43-8933-45bc-8ef9-b4d6856098cc', '27fbca00-a226-4d07-b331-e3c34cd0f63c', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-13T12:06:06.655Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-13T12:06:06.655Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}]', '2026-03-13 12:06:06.658685', '2026-03-13 12:06:06.658685');


--
-- Data for Name: giao_dich_thanh_toan; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (43, '2ff31732-491d-46ad-af06-5948e1a51387', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-2ff31732-197345', NULL, 58000.00, 'CHO_THU_TIEN', NULL, '2026-03-13 11:59:57.346438');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (44, '0be27c43-8933-45bc-8ef9-b4d6856098cc', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-0be27c43-566672', NULL, 29000.00, 'CHO_THU_TIEN', NULL, '2026-03-13 12:06:06.674487');


--
-- Data for Name: gio_hang; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.gio_hang (id, ma_nguoi_dung, ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url, kich_co, so_luong) VALUES (75, 'guest-cart-test-51eb8cd8-872d-404b-ab66-64f8c40b868b', 1, 'Ca phe sua da', 29000, 'https://example.com/a.jpg', 'Nh?', 1);
INSERT INTO orders.gio_hang (id, ma_nguoi_dung, ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url, kich_co, so_luong) VALUES (76, 'guest-cart-test-51eb8cd8-872d-404b-ab66-64f8c40b868b', 1, 'Ca phe sua da', 35000, 'https://example.com/a.jpg', 'V?a', 1);


--
-- Data for Name: thong_bao; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (17, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #2ff31732-491d-46ad-af06-5948e1a51387 da duoc tao thanh cong.', 'ORDER', false, '{"ma_don_hang": "2ff31732-491d-46ad-af06-5948e1a51387", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-13 11:59:57.353985+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (18, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #2ff31732-491d-46ad-af06-5948e1a51387 se duoc thu tien khi giao hang.', 'PAYMENT', false, '{"ma_don_hang": "2ff31732-491d-46ad-af06-5948e1a51387", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-13 11:59:57.382031+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (19, '27fbca00-a226-4d07-b331-e3c34cd0f63c', 'Don hang da duoc tao', 'Don #0be27c43-8933-45bc-8ef9-b4d6856098cc da duoc tao thanh cong.', 'ORDER', false, '{"ma_don_hang": "0be27c43-8933-45bc-8ef9-b4d6856098cc", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-13 12:06:06.679425+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (20, '27fbca00-a226-4d07-b331-e3c34cd0f63c', 'Don COD cho thu tien', 'Don #0be27c43-8933-45bc-8ef9-b4d6856098cc se duoc thu tien khi giao hang.', 'PAYMENT', false, '{"ma_don_hang": "0be27c43-8933-45bc-8ef9-b4d6856098cc", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-13 12:06:06.697622+00');


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

SELECT pg_catalog.setval('orders.chi_tiet_don_hang_id_seq', 47, true);


--
-- Name: danh_gia_san_pham_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.danh_gia_san_pham_id_seq', 3, true);


--
-- Name: giao_dich_thanh_toan_ma_giao_dich_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.giao_dich_thanh_toan_ma_giao_dich_seq', 44, true);


--
-- Name: gio_hang_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.gio_hang_id_seq', 92, true);


--
-- Name: thong_bao_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.thong_bao_id_seq', 20, true);


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

\unrestrict 4EgvKucBZhmxiNG5zw0qxQrHIVbCx8YawqfH0WQz6jatMZ9DLOxSBEgOFX86g5f

