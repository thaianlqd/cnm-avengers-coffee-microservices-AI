--
-- PostgreSQL database dump
--

\restrict Wye4707toXYgdc9jCONz8Ck9DdWvcH9UQ4mgLbsPMdu2r6tADIhPKZHMmLc5860

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
-- Name: chi_nhanh; Type: TABLE; Schema: identity; Owner: admin
--

CREATE TABLE identity.chi_nhanh (
    ma_chi_nhanh character varying NOT NULL,
    ten_chi_nhanh character varying NOT NULL,
    dia_chi text,
    so_dien_thoai character varying,
    trang_thai character varying DEFAULT 'ACTIVE'::character varying NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE identity.chi_nhanh OWNER TO admin;

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
-- Name: khuyen_mai; Type: TABLE; Schema: identity; Owner: admin
--

CREATE TABLE identity.khuyen_mai (
    ma_khuyen_mai character varying(50) NOT NULL,
    ten_khuyen_mai character varying(200) NOT NULL,
    mo_ta text,
    loai_khuyen_mai character varying(20) NOT NULL,
    gia_tri numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    gia_tri_don_toi_thieu numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    giam_toi_da numeric(15,2),
    so_luong_toi_da integer DEFAULT 0 NOT NULL,
    so_luong_da_dung integer DEFAULT 0 NOT NULL,
    gioi_han_moi_nguoi integer DEFAULT 1 NOT NULL,
    ngay_bat_dau timestamp with time zone,
    ngay_ket_thuc timestamp with time zone,
    trang_thai character varying DEFAULT 'ACTIVE'::character varying NOT NULL,
    hien_thi_cho_khach boolean DEFAULT true NOT NULL,
    ten_san_pham_tang character varying,
    hinh_anh character varying,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE identity.khuyen_mai OWNER TO admin;

--
-- Name: khuyen_mai_su_dung; Type: TABLE; Schema: identity; Owner: admin
--

CREATE TABLE identity.khuyen_mai_su_dung (
    id integer NOT NULL,
    ma_khuyen_mai character varying(50) NOT NULL,
    ma_nguoi_dung character varying NOT NULL,
    ma_don_hang character varying,
    so_tien_giam numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    ngay_su_dung timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE identity.khuyen_mai_su_dung OWNER TO admin;

--
-- Name: khuyen_mai_su_dung_id_seq; Type: SEQUENCE; Schema: identity; Owner: admin
--

CREATE SEQUENCE identity.khuyen_mai_su_dung_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE identity.khuyen_mai_su_dung_id_seq OWNER TO admin;

--
-- Name: khuyen_mai_su_dung_id_seq; Type: SEQUENCE OWNED BY; Schema: identity; Owner: admin
--

ALTER SEQUENCE identity.khuyen_mai_su_dung_id_seq OWNED BY identity.khuyen_mai_su_dung.id;


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
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    vai_tro character varying DEFAULT 'CUSTOMER'::character varying NOT NULL,
    co_so_ma character varying,
    co_so_ten character varying
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
    cap_nhat_luc timestamp without time zone DEFAULT now() NOT NULL,
    co_so_ma character varying DEFAULT 'MAC_DINH_CHI'::character varying NOT NULL
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
    ma_danh_muc integer,
    gia_niem_yet numeric(10,2),
    la_hot boolean DEFAULT false NOT NULL,
    la_moi boolean DEFAULT false NOT NULL
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
-- Name: ca_doi_soat; Type: TABLE; Schema: orders; Owner: admin
--

CREATE TABLE orders.ca_doi_soat (
    ma_ca uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    thoi_gian_bat_dau timestamp with time zone NOT NULL,
    thoi_gian_ket_thuc timestamp with time zone NOT NULL,
    tien_dau_ca numeric(12,2) NOT NULL,
    tien_cuoi_ca numeric(12,2) NOT NULL,
    tien_mat_he_thong numeric(12,2) NOT NULL,
    doanh_thu_he_thong numeric(12,2) NOT NULL,
    tien_mat_ky_vong numeric(12,2) NOT NULL,
    chenh_lech numeric(12,2) NOT NULL,
    tong_don integer DEFAULT 0 NOT NULL,
    tong_don_tien_mat integer DEFAULT 0 NOT NULL,
    ghi_chu text,
    ten_nhan_vien character varying,
    du_lieu_tom_tat jsonb DEFAULT '{}'::jsonb NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    trang_thai_phe_duyet character varying DEFAULT 'PENDING'::character varying NOT NULL,
    manager_duyet character varying,
    ghi_chu_phe_duyet text,
    thoi_gian_phe_duyet timestamp with time zone,
    co_so_ma character varying DEFAULT 'MAC_DINH_CHI'::character varying NOT NULL
);


ALTER TABLE orders.ca_doi_soat OWNER TO admin;

--
-- Name: ca_lam_viec_nhan_vien; Type: TABLE; Schema: orders; Owner: admin
--

CREATE TABLE orders.ca_lam_viec_nhan_vien (
    ma_ca_lam_viec uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    staff_username character varying NOT NULL,
    staff_name character varying NOT NULL,
    ngay_lam_viec date NOT NULL,
    ma_khung_ca character varying NOT NULL,
    ten_ca character varying NOT NULL,
    gio_bat_dau character varying NOT NULL,
    gio_ket_thuc character varying NOT NULL,
    trang_thai_cham_cong character varying DEFAULT 'ASSIGNED'::character varying NOT NULL,
    check_in_at timestamp with time zone,
    check_out_at timestamp with time zone,
    note character varying,
    manager_username character varying,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL,
    co_so_ma character varying DEFAULT 'MAC_DINH_CHI'::character varying NOT NULL,
    nguon_tao character varying DEFAULT 'MANAGER_ASSIGNMENT'::character varying NOT NULL,
    trang_thai_yeu_cau character varying DEFAULT 'APPROVED'::character varying NOT NULL,
    thoi_gian_gui_yeu_cau timestamp with time zone,
    nguoi_duyet_yeu_cau character varying,
    ghi_chu_duyet text,
    thoi_gian_duyet timestamp with time zone
);


ALTER TABLE orders.ca_lam_viec_nhan_vien OWNER TO admin;

--
-- Name: chat_conversation; Type: TABLE; Schema: orders; Owner: admin
--

CREATE TABLE orders.chat_conversation (
    ma_hoi_thoai uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ma_khach_hang character varying NOT NULL,
    ten_khach_hang character varying,
    ma_nhan_su_phu_trach character varying,
    ten_nhan_su_phu_trach character varying,
    vai_tro_nhan_su_phu_trach character varying,
    trang_thai character varying DEFAULT 'OPEN'::character varying NOT NULL,
    tin_nhan_cuoi text,
    vai_tro_nguoi_gui_cuoi character varying,
    so_tin_nhan_chua_doc_khach integer DEFAULT 0 NOT NULL,
    so_tin_nhan_chua_doc_nhan_su integer DEFAULT 0 NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE orders.chat_conversation OWNER TO admin;

--
-- Name: chat_message; Type: TABLE; Schema: orders; Owner: admin
--

CREATE TABLE orders.chat_message (
    id integer NOT NULL,
    ma_hoi_thoai uuid NOT NULL,
    ma_nguoi_gui character varying NOT NULL,
    ten_nguoi_gui character varying,
    vai_tro_nguoi_gui character varying NOT NULL,
    noi_dung text NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE orders.chat_message OWNER TO admin;

--
-- Name: chat_message_id_seq; Type: SEQUENCE; Schema: orders; Owner: admin
--

CREATE SEQUENCE orders.chat_message_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE orders.chat_message_id_seq OWNER TO admin;

--
-- Name: chat_message_id_seq; Type: SEQUENCE OWNED BY; Schema: orders; Owner: admin
--

ALTER SEQUENCE orders.chat_message_id_seq OWNED BY orders.chat_message.id;


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
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL,
    phan_hoi_quan_ly text,
    nguoi_phan_hoi character varying,
    thoi_gian_phan_hoi timestamp with time zone
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
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL,
    loai_don_hang character varying,
    ma_ban character varying,
    ten_khach_hang character varying,
    ten_thu_ngan character varying,
    co_so_ma character varying DEFAULT 'MAC_DINH_CHI'::character varying NOT NULL,
    tien_khach_dua numeric(12,2),
    tien_thoi numeric(12,2) DEFAULT '0'::numeric
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
-- Name: khuyen_mai_su_dung id; Type: DEFAULT; Schema: identity; Owner: admin
--

ALTER TABLE ONLY identity.khuyen_mai_su_dung ALTER COLUMN id SET DEFAULT nextval('identity.khuyen_mai_su_dung_id_seq'::regclass);


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
-- Name: chat_message id; Type: DEFAULT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.chat_message ALTER COLUMN id SET DEFAULT nextval('orders.chat_message_id_seq'::regclass);


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
-- Data for Name: chi_nhanh; Type: TABLE DATA; Schema: identity; Owner: admin
--

INSERT INTO identity.chi_nhanh (ma_chi_nhanh, ten_chi_nhanh, dia_chi, so_dien_thoai, trang_thai, ngay_tao, ngay_cap_nhat) VALUES ('THE_GRACE_TOWER', 'The Grace Tower', 'The Grace Tower, TP.HCM', NULL, 'ACTIVE', '2026-03-15 07:32:26.5506', '2026-03-15 07:32:26.5506');
INSERT INTO identity.chi_nhanh (ma_chi_nhanh, ten_chi_nhanh, dia_chi, so_dien_thoai, trang_thai, ngay_tao, ngay_cap_nhat) VALUES ('MAC_DINH_CHI', 'Mạc Đĩnh Chi', 'Cơ sở Mạc Đĩnh Chi, TP.HCM', NULL, 'ACTIVE', '2026-03-15 07:32:26.536298', '2026-03-15 07:35:55.533353');
INSERT INTO identity.chi_nhanh (ma_chi_nhanh, ten_chi_nhanh, dia_chi, so_dien_thoai, trang_thai, ngay_tao, ngay_cap_nhat) VALUES ('THANHAN', 'thành an', 'Binh Hien, Quan Hai Chau, Da Nang', NULL, 'ACTIVE', '2026-03-17 03:42:41.993904', '2026-03-17 03:42:41.993904');


--
-- Data for Name: dia_chi_giao_hang; Type: TABLE DATA; Schema: identity; Owner: admin
--

INSERT INTO identity.dia_chi_giao_hang (id, ma_nguoi_dung, ten_dia_chi, dia_chi_day_du, ghi_chu, mac_dinh, ngay_tao, ngay_cap_nhat) VALUES (1, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'KTX', 'KTX Khu A, Dai hoc Cong nghe Moi aaaa', 'Cong A', false, '2026-03-12 15:21:22.350935', '2026-03-17 02:45:15.367983');
INSERT INTO identity.dia_chi_giao_hang (id, ma_nguoi_dung, ten_dia_chi, dia_chi_day_du, ghi_chu, mac_dinh, ngay_tao, ngay_cap_nhat) VALUES (2, 'b81d9738-535e-4475-884d-aeb3b7324f01', '28 Ter B Mạc Đĩnh Chi', '28 Ter B Mạc Đĩnh Chi, Tân Phú, Quận 7, Thành phố Hồ Chí Minh', NULL, true, '2026-03-14 15:43:19.300439', '2026-03-17 02:45:32.09505');


--
-- Data for Name: khuyen_mai; Type: TABLE DATA; Schema: identity; Owner: admin
--

INSERT INTO identity.khuyen_mai (ma_khuyen_mai, ten_khuyen_mai, mo_ta, loai_khuyen_mai, gia_tri, gia_tri_don_toi_thieu, giam_toi_da, so_luong_toi_da, so_luong_da_dung, gioi_han_moi_nguoi, ngay_bat_dau, ngay_ket_thuc, trang_thai, hien_thi_cho_khach, ten_san_pham_tang, hinh_anh, ngay_tao, ngay_cap_nhat) VALUES ('SUMMER2026', 'GIẢM 10% MÙA HÈ', 'là khách hàng', 'PERCENT', 10.00, 15000.00, 50000.00, 0, 1, 1, NULL, NULL, 'ACTIVE', true, NULL, NULL, '2026-03-15 08:35:27.017107', '2026-03-17 04:04:54.343028');


--
-- Data for Name: khuyen_mai_su_dung; Type: TABLE DATA; Schema: identity; Owner: admin
--

INSERT INTO identity.khuyen_mai_su_dung (id, ma_khuyen_mai, ma_nguoi_dung, ma_don_hang, so_tien_giam, ngay_su_dung) VALUES (1, 'SUMMER2026', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'df84e119-6e03-47c5-b885-60b49b122a85', 5800.00, '2026-03-17 04:04:54.35669');


--
-- Data for Name: nguoi_dung; Type: TABLE DATA; Schema: identity; Owner: admin
--

INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten) VALUES ('e4085f96-bc91-412e-8bcc-2b529703c64d', 'fix86749@mail.com', '$2b$10$Br8iRwT9qBnECpfTBxDEPeKzVATbv7L/aAeSXE7mpPabR/UZ7ic/2', 'Fix User', 'fix86749@mail.com', NULL, NULL, 'ACTIVE', 0, '2026-03-13 11:59:45.732631', 'CUSTOMER', NULL, NULL);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten) VALUES ('27fbca00-a226-4d07-b331-e3c34cd0f63c', 'thanhan@gmail.com', '$2b$10$EKlQiWhSDjS2v/vz0zhbVeVFLniMyZd8wa09mR6xK1jHxzQqR8dGO', 'thanh an', 'thanhan@gmail.com', NULL, NULL, 'ACTIVE', 29, '2026-03-13 12:05:44.570514', 'CUSTOMER', NULL, NULL);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten) VALUES ('c3ed7560-01a5-42be-a661-45c0cfefbb5d', 'thaian@gmail.com', '$2b$10$0rCvF.10cj0zGz.mXJIQV.GwdXxPsZvXoYPaDO2m3/6iOWaj1AtSm', 'thaian1', 'thaian@gmail.com', NULL, NULL, 'ACTIVE', 0, '2026-03-13 14:12:06.043199', 'CUSTOMER', NULL, NULL);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten) VALUES ('b81d9738-535e-4475-884d-aeb3b7324f01', 'ankudo1234@gmail.com', '$2b$10$jNqlDzBfxC5Z3ZWxSTcjaetEaVUH9Yf84Twex9OycQgSvT0ClkF9.', 'thái an hello', 'ankudo1234@gmail.com', '0914835114', NULL, 'ACTIVE', 1484, '2026-03-11 01:04:42.084098', 'CUSTOMER', NULL, NULL);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten) VALUES ('a945ca5d-2055-4f49-bebb-e706c267d9bb', 'thaian_staff', '$2b$10$4cO4d6W7LoBEPEsLo68pMeXOyhB1j8q2PTFL6eMim82N5Hy8PcHti', 'Thái An (Nhân viên cửa hàng)', 'thaian_staff', NULL, NULL, 'ACTIVE', 0, '2026-03-13 14:35:08.665625', 'STAFF', NULL, NULL);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten) VALUES ('714fcc38-8692-49f9-9d1c-2f0fbf4f509e', 'thaian_manager', '$2b$10$7O4U5vqFp6C5m2zcBUPbM.HbwoFd5OMBavD0hMC.ZAyfte23tuSn.', 'Thái An (Quản lý cửa hàng)', 'thaian_manager', NULL, NULL, 'ACTIVE', 0, '2026-03-14 00:59:59.699192', 'MANAGER', NULL, NULL);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten) VALUES ('702cbcb9-9722-4d40-884d-51fff33ece8f', 'thaian_staff_thegracetower', '$2b$10$IRPMapvrOSF587JvwasXD.mntANygqnixcp6zIp9ITEzawzLgQFuK', 'Thái An - Nhân viên cơ sở The Grace Tower', 'thaian_staff_thegracetower', NULL, NULL, 'ACTIVE', 0, '2026-03-14 14:56:39.742949', 'STAFF', 'THE_GRACE_TOWER', 'The Grace Tower');
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten) VALUES ('be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'thaian_manager_thegracetower', '$2b$10$VoaMM8IDrT0AJBAVKm9jfufIBNZCB1oRYCes6L6cbfocV2MOL/s9G', 'Thái An - Quản lý cơ sở The Grace Tower', 'thaian_manager_thegracetower', NULL, NULL, 'ACTIVE', 0, '2026-03-14 14:56:39.884026', 'MANAGER', 'THE_GRACE_TOWER', 'The Grace Tower');
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten) VALUES ('60e6dc26-351f-47a5-abe3-0d892272c1ab', 'thaian_staff_macdinhchi', '$2b$10$yronmJzIUrT3rKp27sudPOv1xrw35hoF7N3uJ3UY12O1PmnlE/fXK', 'Thái An - Nhân viên cơ sở Mạc Đĩnh Chi', 'thaian_staff_macdinhchi', NULL, NULL, 'ACTIVE', 0, '2026-03-14 14:56:39.448884', 'STAFF', 'MAC_DINH_CHI', 'Mạc Đĩnh Chi');
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten) VALUES ('af7da2da-eaa7-4349-8ce3-7eaa2f3213ad', 'thaian_admin', '$2b$10$Nu550XT6eiGep910e3r1wuIWV96HuU65/JPAhbwUCGBUpSS1GH5R.', 'Thái An - Quản trị viên hệ thống', 'thaian_admin', NULL, NULL, 'ACTIVE', 0, '2026-03-14 20:12:03.584089', 'ADMIN', NULL, NULL);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten) VALUES ('03f1a264-f077-44b4-96da-9de76cc75989', 'thaian_manager_macdinhchi', '$2b$10$hGnAI/xVJKOk2BRP6jwW1ebET1ewzmztcBc9jc8ETNCoVrhJ53G9K', 'Thái An - Quản lý cơ sở Mạc Đĩnh Chi', 'thaian_manager_macdinhchi', NULL, NULL, 'ACTIVE', 0, '2026-03-14 14:56:39.604262', 'MANAGER', 'MAC_DINH_CHI', 'Mạc Đĩnh Chi');


--
-- Data for Name: ton_kho_san_pham; Type: TABLE DATA; Schema: inventory; Owner: admin
--

INSERT INTO inventory.ton_kho_san_pham (id, ma_san_pham, so_luong_ton, muc_canh_bao, dang_kinh_doanh, cap_nhat_luc, co_so_ma) VALUES (1, 1, 0, 0, true, '2026-03-13 15:47:16.728172', 'MAC_DINH_CHI');
INSERT INTO inventory.ton_kho_san_pham (id, ma_san_pham, so_luong_ton, muc_canh_bao, dang_kinh_doanh, cap_nhat_luc, co_so_ma) VALUES (2, 3, 0, 0, true, '2026-03-14 18:23:41.359719', 'THE_GRACE_TOWER');
INSERT INTO inventory.ton_kho_san_pham (id, ma_san_pham, so_luong_ton, muc_canh_bao, dang_kinh_doanh, cap_nhat_luc, co_so_ma) VALUES (3, 2, 0, 0, true, '2026-03-14 19:07:12.676947', 'THE_GRACE_TOWER');
INSERT INTO inventory.ton_kho_san_pham (id, ma_san_pham, so_luong_ton, muc_canh_bao, dang_kinh_doanh, cap_nhat_luc, co_so_ma) VALUES (4, 2, 0, 0, true, '2026-03-17 17:46:59.80604', 'MAC_DINH_CHI');


--
-- Data for Name: danh_muc; Type: TABLE DATA; Schema: menu; Owner: admin
--

INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (1, 'Cà phê', '☕');
INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (2, 'Trà', '🍃');
INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (3, 'Đồ ăn', '🍕');


--
-- Data for Name: san_pham; Type: TABLE DATA; Schema: menu; Owner: admin
--

INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (2, 'Trà Đào Cam Sả', 45000.00, 'Trà đào thơm mát, tươi mới', '/images/products/tra-dao-cam-sa.jpg', true, 2, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (1, 'Cà Phê Sữa Đá', 29000.00, 'Cà phê sữa lạnh thơm ngon', '/images/products/ca-phe-sua-da.jpg', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (4, 'Espresso Đá', 49000.00, 'Một tách Espresso nguyên bản được bắt đầu bởi những hạt Arabica chất lượng, phối trộn với tỉ lệ cân đối hạt Robusta, cho ra vị ngọt caramel, vị chua dịu và sánh đặc.', '/images/products/espresso-a.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (3, 'Pizza 5 Cheese', 39000.00, 'Pizza 5 loại phô mai thơm ngon', '/images/products/pizza-5-cheese.jpg', true, 3, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (5, 'Americano Nóng', 45000.00, 'Americano được pha chế bằng cách pha thêm nước với tỷ lệ nhất định vào tách cà phê Espresso, từ đó mang lại hương vị nhẹ nhàng và giữ trọn được mùi hương cà phê đặc trưng.', '/images/products/americano-nong.png', false, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (6, 'hihi', 39000.00, NULL, '/images/products/hihi.png', true, 1, 45000.00, true, true);


--
-- Data for Name: ca_doi_soat; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.ca_doi_soat (ma_ca, thoi_gian_bat_dau, thoi_gian_ket_thuc, tien_dau_ca, tien_cuoi_ca, tien_mat_he_thong, doanh_thu_he_thong, tien_mat_ky_vong, chenh_lech, tong_don, tong_don_tien_mat, ghi_chu, ten_nhan_vien, du_lieu_tom_tat, ngay_tao, trang_thai_phe_duyet, manager_duyet, ghi_chu_phe_duyet, thoi_gian_phe_duyet, co_so_ma) VALUES ('65c617ac-b90d-4560-bf4c-4469c7745156', '2026-03-13 00:00:00+00', '2026-03-13 16:37:37.02+00', 1000000.00, 1200000.00, 215000.00, 244000.00, 1215000.00, -15000.00, 6, 5, 'smoke test', 'automation', '{"non_cash_revenue": 29000}', '2026-03-13 16:37:37.136005', 'PENDING', NULL, NULL, NULL, 'MAC_DINH_CHI');
INSERT INTO orders.ca_doi_soat (ma_ca, thoi_gian_bat_dau, thoi_gian_ket_thuc, tien_dau_ca, tien_cuoi_ca, tien_mat_he_thong, doanh_thu_he_thong, tien_mat_ky_vong, chenh_lech, tong_don, tong_don_tien_mat, ghi_chu, ten_nhan_vien, du_lieu_tom_tat, ngay_tao, trang_thai_phe_duyet, manager_duyet, ghi_chu_phe_duyet, thoi_gian_phe_duyet, co_so_ma) VALUES ('4939bb26-6074-470b-b827-5f9029655574', '2026-03-12 17:00:00+00', '2026-03-13 16:38:36.936+00', 1000000.00, 3460000.00, 215000.00, 244000.00, 1215000.00, 2245000.00, 6, 5, NULL, 'thaian_admin', '{"non_cash_revenue": 29000}', '2026-03-13 16:50:45.68935', 'PENDING', NULL, NULL, NULL, 'MAC_DINH_CHI');
INSERT INTO orders.ca_doi_soat (ma_ca, thoi_gian_bat_dau, thoi_gian_ket_thuc, tien_dau_ca, tien_cuoi_ca, tien_mat_he_thong, doanh_thu_he_thong, tien_mat_ky_vong, chenh_lech, tong_don, tong_don_tien_mat, ghi_chu, ten_nhan_vien, du_lieu_tom_tat, ngay_tao, trang_thai_phe_duyet, manager_duyet, ghi_chu_phe_duyet, thoi_gian_phe_duyet, co_so_ma) VALUES ('1a6ea4a6-029e-4686-b1fa-4e6daad0066d', '2026-03-17 00:00:00+00', '2026-03-17 15:00:00+00', 1000000.00, 2158000.00, 1100000.00, 1100000.00, 2100000.00, 58000.00, 2, 2, NULL, 'thaian_staff_macdinhchi', '{"cash_net": 1100000, "shift_date": "2026-03-17", "cash_in_gross": 1121000, "online_revenue": 1071000, "cash_change_out": 21000, "in_store_revenue": 29000, "non_cash_revenue": 0}', '2026-03-17 03:13:15.879266', 'PENDING', NULL, NULL, NULL, 'MAC_DINH_CHI');
INSERT INTO orders.ca_doi_soat (ma_ca, thoi_gian_bat_dau, thoi_gian_ket_thuc, tien_dau_ca, tien_cuoi_ca, tien_mat_he_thong, doanh_thu_he_thong, tien_mat_ky_vong, chenh_lech, tong_don, tong_don_tien_mat, ghi_chu, ten_nhan_vien, du_lieu_tom_tat, ngay_tao, trang_thai_phe_duyet, manager_duyet, ghi_chu_phe_duyet, thoi_gian_phe_duyet, co_so_ma) VALUES ('95c189e6-9138-4371-a860-8aff03d919e2', '2026-03-15 00:00:00+00', '2026-03-15 15:00:00+00', 1000000.00, 1135000.00, 135000.00, 135000.00, 1135000.00, 0.00, 3, 3, NULL, 'thaian_staff_thegracetower', '{"cash_net": 135000, "shift_date": "2026-03-15", "cash_in_gross": 590000, "online_revenue": 0, "cash_change_out": 455000, "in_store_revenue": 135000, "non_cash_revenue": 0}', '2026-03-14 19:48:37.508099', 'APPROVED', 'thaian_manager_thegracetower', NULL, '2026-03-14 19:49:36.277+00', 'THE_GRACE_TOWER');


--
-- Data for Name: ca_lam_viec_nhan_vien; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('1bbfd46e-af47-4cd7-b8b3-bc9a1eda1d01', 'thaian_staff', 'thaian_staff', '2026-03-14', 'SANG', 'Ca sang', '07:00', '12:00', 'ASSIGNED', NULL, NULL, NULL, 'thaian_manager', '2026-03-14 01:31:25.176129', '2026-03-14 01:31:25.176129', 'MAC_DINH_CHI', 'MANAGER_ASSIGNMENT', 'APPROVED', NULL, NULL, NULL, NULL);
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('785cbef6-4bbb-4bf3-9e8b-938dba29b452', 'thaian_staff', 'thaian_staff', '2026-03-14', 'TOI', 'Ca toi', '17:00', '22:00', 'ASSIGNED', NULL, NULL, NULL, 'thaian_manager', '2026-03-14 01:31:42.571531', '2026-03-14 01:31:42.571531', 'MAC_DINH_CHI', 'MANAGER_ASSIGNMENT', 'APPROVED', NULL, NULL, NULL, NULL);
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('171a48bf-5e2b-44be-bf34-c520a4fb634f', 'thaian_staff', 'thaian_staff', '2026-03-14', 'CHIEU', 'Ca chieu', '12:00', '17:00', 'ASSIGNED', NULL, NULL, NULL, 'thaian_manager', '2026-03-14 01:31:51.671899', '2026-03-14 01:31:51.671899', 'MAC_DINH_CHI', 'MANAGER_ASSIGNMENT', 'APPROVED', NULL, NULL, NULL, NULL);
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('76840e5a-12d0-400a-bc97-3f3d7f0d5b19', 'thaian_staff_macdinhchi', 'thaian_staff_macdinhchi', '2026-03-14', 'SANG', 'Ca sang', '07:00', '12:00', 'ASSIGNED', NULL, NULL, NULL, 'thaian_manager_thegracetower', '2026-03-14 17:18:08.574927', '2026-03-14 17:18:08.574927', 'THE_GRACE_TOWER', 'MANAGER_ASSIGNMENT', 'APPROVED', NULL, NULL, NULL, NULL);
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('ea15d186-3d84-407a-afce-0838ac675326', 'thaian_staff_macdinhchi', 'thaian_staff_macdinhchi', '2026-03-14', 'CHIEU', 'Ca chieu', '12:00', '17:00', 'ASSIGNED', NULL, NULL, NULL, 'thaian_manager_thegracetower', '2026-03-14 17:18:08.574927', '2026-03-14 17:18:08.574927', 'THE_GRACE_TOWER', 'MANAGER_ASSIGNMENT', 'APPROVED', NULL, NULL, NULL, NULL);
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('3110456b-1d06-4320-a6d8-61d9ac7a389a', 'thaian_staff_macdinhchi', 'thaian_staff_macdinhchi', '2026-03-14', 'TOI', 'Ca toi', '17:00', '22:00', 'ASSIGNED', NULL, NULL, NULL, 'thaian_manager_thegracetower', '2026-03-14 17:18:08.574927', '2026-03-14 17:18:08.574927', 'THE_GRACE_TOWER', 'MANAGER_ASSIGNMENT', 'APPROVED', NULL, NULL, NULL, NULL);
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('811151ef-0a37-4163-bb20-a99d3f2d6f37', 'thaian_staff_thegracetower', 'Thái An - Nhân viên cơ sở The Grace Tower', '2026-03-14', 'SANG', 'Ca sang', '07:00', '12:00', 'ASSIGNED', NULL, NULL, NULL, 'thaian_manager_thegracetower', '2026-03-14 17:40:13.998151', '2026-03-14 17:40:13.998151', 'THE_GRACE_TOWER', 'MANAGER_ASSIGNMENT', 'APPROVED', NULL, NULL, NULL, NULL);
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('e74ac00d-2ee1-484b-9b1c-a7d881747cc8', 'thaian_staff_thegracetower', 'Thái An - Nhân viên cơ sở The Grace Tower', '2026-03-14', 'TOI', 'Ca toi', '17:00', '22:00', 'ASSIGNED', NULL, NULL, NULL, 'thaian_manager_thegracetower', '2026-03-14 17:40:13.998151', '2026-03-14 17:40:13.998151', 'THE_GRACE_TOWER', 'MANAGER_ASSIGNMENT', 'APPROVED', NULL, NULL, NULL, NULL);
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('1b18b597-e9e1-459a-93c4-425572d4df31', 'thaian_staff_thegracetower', 'Thái An - Nhân viên cơ sở The Grace Tower', '2026-03-14', 'CHIEU', 'Ca chieu', '12:00', '17:00', 'ASSIGNED', NULL, NULL, NULL, 'thaian_manager_thegracetower', '2026-03-14 17:40:20.031212', '2026-03-14 17:40:20.031212', 'THE_GRACE_TOWER', 'MANAGER_ASSIGNMENT', 'APPROVED', NULL, NULL, NULL, NULL);
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('e75b1f7b-5713-4f7a-820f-3f679b40c172', 'thaian_staff_macdinhchi', 'Thái An - Nhân viên cơ sở Mạc Đĩnh Chi', '2026-03-17', 'SANG', 'Ca sang', '07:00', '12:00', 'PRESENT', NULL, '2026-03-17 14:53:59.677+00', NULL, 'thaian_manager_macdinhchi', '2026-03-17 03:15:17.777323', '2026-03-17 14:53:59.696978', 'MAC_DINH_CHI', 'MANAGER_ASSIGNMENT', 'APPROVED', NULL, NULL, NULL, NULL);
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('f78b4c76-ef14-4584-befa-ed727e704cb6', 'thaian_staff_macdinhchi', 'Thai An Staff', '2026-03-19', 'SANG', 'Ca sang', '07:00', '12:00', 'ASSIGNED', NULL, NULL, 'Smoke request', NULL, '2026-03-17 18:26:44.275445', '2026-03-17 18:26:44.275445', 'MAC_DINH_CHI', 'STAFF_REQUEST', 'PENDING', '2026-03-17 18:26:44.272+00', NULL, NULL, NULL);
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('28d1155a-ab95-4325-b3e0-22ed0f14903e', 'thaian_staff_macdinhchi', 'Thái An - Nhân viên cơ sở Mạc Đĩnh Chi', '2026-03-16', 'CHIEU', 'Ca chieu', '12:00', '17:00', 'PRESENT', '2026-03-17 03:16:09.181+00', '2026-03-17 03:16:21.795+00', NULL, 'thaian_manager_macdinhchi', '2026-03-17 03:15:22.262769', '2026-03-17 03:16:21.810501', 'MAC_DINH_CHI', 'MANAGER_ASSIGNMENT', 'APPROVED', NULL, NULL, NULL, NULL);
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('e6a8ff5d-6005-4c8d-b707-f04a50a053fc', 'thaian_staff_macdinhchi', 'Thái An - Nhân viên cơ sở Mạc Đĩnh Chi', '2026-03-16', 'TOI', 'Ca toi', '17:00', '22:00', 'PRESENT', '2026-03-17 03:16:18.569+00', '2026-03-17 03:16:24.813+00', NULL, 'thaian_manager_macdinhchi', '2026-03-17 03:15:22.262769', '2026-03-17 03:16:24.834598', 'MAC_DINH_CHI', 'MANAGER_ASSIGNMENT', 'APPROVED', NULL, NULL, NULL, NULL);
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('37912c9c-f593-4066-9c78-af6d85352660', 'thaian_staff_macdinhchi', 'Thai An Staff', '2026-03-20', 'CHIEU', 'Ca chieu', '12:00', '17:00', 'ASSIGNED', NULL, NULL, 'Smoke request 2', NULL, '2026-03-17 18:27:07.780646', '2026-03-17 18:27:21.32571', 'MAC_DINH_CHI', 'STAFF_REQUEST', 'APPROVED', '2026-03-17 18:27:07.78+00', 'thaian_admin', 'Smoke approved', '2026-03-17 18:27:21.314+00');
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('7be230cc-5c1b-4923-9638-4eac94d6ea4e', 'thaian_staff_macdinhchi', 'thaian_staff_macdinhchi', '2026-03-18', 'SANG', 'Ca sang', '07:00', '12:00', 'ASSIGNED', NULL, NULL, NULL, NULL, '2026-03-17 18:29:53.976302', '2026-03-17 18:29:53.976302', 'MAC_DINH_CHI', 'STAFF_REQUEST', 'PENDING', '2026-03-17 18:29:53.97+00', NULL, NULL, NULL);
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('c05899a4-3103-4a1a-ad38-df7669bafc6f', 'thaian_staff_macdinhchi', 'thaian_staff_macdinhchi', '2026-03-18', 'CHIEU', 'Ca chieu', '12:00', '17:00', 'ASSIGNED', NULL, NULL, NULL, NULL, '2026-03-17 18:31:23.005435', '2026-03-17 18:31:23.005435', 'MAC_DINH_CHI', 'STAFF_REQUEST', 'PENDING', '2026-03-17 18:31:23.004+00', NULL, NULL, NULL);
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('9f728ccb-2ef1-4e1b-83cd-20697cac5573', 'thaian_staff_macdinhchi', 'Thái An - Nhân viên cơ sở Mạc Đĩnh Chi', '2026-03-17', 'TOI', 'Ca toi', '17:00', '22:00', 'ABSENT', NULL, NULL, NULL, 'thaian_manager_macdinhchi', '2026-03-17 03:15:17.777323', '2026-03-17 14:53:42.745096', 'MAC_DINH_CHI', 'MANAGER_ASSIGNMENT', 'APPROVED', NULL, NULL, NULL, NULL);
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('4248e6da-17b3-438e-92b1-d743d913586b', 'thaian_staff_macdinhchi', 'Thái An - Nhân viên cơ sở Mạc Đĩnh Chi', '2026-03-17', 'CHIEU', 'Ca chieu', '12:00', '17:00', 'ABSENT', NULL, NULL, NULL, 'thaian_manager_macdinhchi', '2026-03-17 03:15:17.777323', '2026-03-17 14:53:53.449817', 'MAC_DINH_CHI', 'MANAGER_ASSIGNMENT', 'APPROVED', NULL, NULL, NULL, NULL);


--
-- Data for Name: chat_conversation; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.chat_conversation (ma_hoi_thoai, ma_khach_hang, ten_khach_hang, ma_nhan_su_phu_trach, ten_nhan_su_phu_trach, vai_tro_nhan_su_phu_trach, trang_thai, tin_nhan_cuoi, vai_tro_nguoi_gui_cuoi, so_tin_nhan_chua_doc_khach, so_tin_nhan_chua_doc_nhan_su, ngay_tao, ngay_cap_nhat) VALUES ('1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hi', '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'thaian_staff_macdinhchi', 'STAFF', 'OPEN', 'tôi là huy đẹp trai', 'CUSTOMER', 1, 0, '2026-03-14 02:30:55.460023', '2026-03-17 12:10:09.191998');


--
-- Data for Name: chat_message; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (1, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hi', 'CUSTOMER', 'xin chào', '2026-03-14 02:30:58.443712');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (2, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'a945ca5d-2055-4f49-bebb-e706c267d9bb', 'thaian_staff', 'STAFF', 'chào bạn nhé', '2026-03-14 02:31:08.545334');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (3, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hi', 'CUSTOMER', 'hi chao', '2026-03-15 17:29:27.44882');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (4, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hi', 'CUSTOMER', 'hi', '2026-03-15 17:38:42.311254');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (5, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hi', 'CUSTOMER', 'hu', '2026-03-15 18:56:22.408748');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (6, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hi', 'CUSTOMER', 'h', '2026-03-15 19:45:50.83372');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (7, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hi', 'CUSTOMER', 'hi', '2026-03-16 08:43:07.254467');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (8, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hi', 'CUSTOMER', 'xin chào', '2026-03-16 16:03:43.542021');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (9, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hello', 'CUSTOMER', 'hello bạn', '2026-03-17 02:33:08.945561');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (10, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hello', 'CUSTOMER', 'hello', '2026-03-17 04:08:00.109702');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (11, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'thaian_staff_macdinhchi', 'STAFF', 'hi an', '2026-03-17 04:08:11.090924');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (12, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hello', 'CUSTOMER', 'tôi là huy đẹp trai', '2026-03-17 12:09:35.822689');


--
-- Data for Name: chi_tiet_don_hang; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (45, '2ff31732-491d-46ad-af06-5948e1a51387', 1, 'Cà Phê Sữa Đá', 29000.00, 1, 'Nhỏ', '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (46, '2ff31732-491d-46ad-af06-5948e1a51387', 1, 'Test Coffee', 29000.00, 1, 'Nh?', 'https://example.com/a.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (47, '0be27c43-8933-45bc-8ef9-b4d6856098cc', 1, 'Cà Phê Sữa Đá', 29000.00, 1, 'Nhỏ', '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (48, '6dcb1d79-4a3c-42b4-94b2-eee97df7de78', 1, 'Cà Phê Sữa Đá', 35000.00, 2, 'Vừa', '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (49, 'e17672c1-948c-4400-8fe2-ed45f9d74f8a', 1, 'C� Ph� S?a D�', 29000.00, 1, NULL, NULL);
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (50, '19c8545d-ab54-49d1-a21b-93ca1f2170b9', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, NULL);
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (51, '327d9e95-d364-4e6e-96b1-9b80d5c337fe', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, NULL);
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (52, 'f230b7e1-cb59-4760-92a9-8bdc79b8e4e9', 2, 'Trà Đào Cam Sả', 45000.00, 1, 'Nhỏ', '/images/products/tra-dao-cam-sa.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (53, '421e3fac-b771-463a-800a-ddc5856e9679', 2, 'Trà Đào Cam Sả', 45000.00, 1, 'Nhỏ', '/images/products/tra-dao-cam-sa.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (54, '687d5d6b-850e-4bef-8644-3428a3c579a1', 2, 'Trà Đào Cam Sả', 45000.00, 1, 'Nhỏ', '/images/products/tra-dao-cam-sa.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (55, '578b04ff-1b70-457b-8909-778f2c44fd79', 2, 'Trà Đào Cam Sả', 45000.00, 1, NULL, NULL);
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (56, '64cf42ee-0ff8-485c-bacc-681c4f9b314a', 2, 'Trà Đào Cam Sả', 45000.00, 1, NULL, NULL);
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (57, 'ba1d6a75-6409-4bee-a355-24a6b6973f66', 2, 'Trà Đào Cam Sả', 45000.00, 1, NULL, NULL);
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (62, '4f8fa1f0-261a-4388-bbce-956ae00ea049', 2, 'Trà Đào Cam Sả', 45000.00, 1, NULL, NULL);
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (63, '9159cb4b-974d-4578-bf0d-a0d036f5e4bb', 1, 'Cà Phê Sữa Đá', 29000.00, 1, 'Nhỏ', '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (64, '358f6f4f-fa2a-463a-ae3a-360bf56a2be7', 1, 'Cà Phê Sữa Đá', 29000.00, 1, 'Nhỏ', '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (65, 'cb628904-5a9d-4fa7-8cea-4f7848af65fb', 1, 'Cà Phê Sữa Đá', 29000.00, 11, 'Nhỏ', '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (66, 'cb628904-5a9d-4fa7-8cea-4f7848af65fb', 2, 'Trà Đào Cam Sả', 45000.00, 8, 'Nhỏ', '/images/products/tra-dao-cam-sa.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (67, 'cb628904-5a9d-4fa7-8cea-4f7848af65fb', 4, 'Espresso Đá', 49000.00, 8, 'Nhỏ', '/images/products/espresso-a.png');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (69, 'ca477171-d11e-465e-90c6-351e66cec71c', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, NULL);
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (70, '8e89f317-6df9-457d-a4ee-bf36664691f8', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, NULL);
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (71, 'df84e119-6e03-47c5-b885-60b49b122a85', 1, 'Cà Phê Sữa Đá', 29000.00, 2, 'Nhỏ', '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (76, '9f80309f-0c7e-45ed-8e14-86528fc13474', 1, 'Cà Phê Sữa Đá', 29000.00, 2, 'Vừa', '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (77, '4e3b5277-955c-4c9a-bd52-e7920c8d959c', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, NULL);
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (79, '7b86cb6c-afe6-4130-95c7-550acbc3c1b7', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, NULL);
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (80, 'add48a2f-dd97-41c2-a05a-4b4d66b2ce6c', 1, 'Cà Phê Sữa Đá', 29000.00, 1, NULL, NULL);
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (81, '0af2977d-023b-4b1a-9e47-f2debd1c7ce1', 1, 'Debug QR', 25000.00, 1, 'Nh?', '');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (82, '5e3b0e5f-7b69-4e01-8732-d940f6823310', 1, 'Debug QR2', 25000.00, 1, 'Nh?', '');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (83, '35bef7d9-c1db-410f-8e1e-a21fffe1edb9', 1, 'Cafe Sua Da', 29000.00, 1, 'Nh?', '/images/products/default.png');


--
-- Data for Name: danh_gia_san_pham; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.danh_gia_san_pham (id, ma_san_pham, ma_nguoi_dung, so_sao, binh_luan, ma_don_hang, ngay_tao, ngay_cap_nhat, phan_hoi_quan_ly, nguoi_phan_hoi, thoi_gian_phan_hoi) VALUES (1, '00000000-0000-0000-0000-000000000001', 'b81d9738-535e-4475-884d-aeb3b7324f01', 4, 'Test qua gateway ok', NULL, '2026-03-12 15:49:20.189312', '2026-03-12 16:05:55.724029', NULL, NULL, NULL);
INSERT INTO orders.danh_gia_san_pham (id, ma_san_pham, ma_nguoi_dung, so_sao, binh_luan, ma_don_hang, ngay_tao, ngay_cap_nhat, phan_hoi_quan_ly, nguoi_phan_hoi, thoi_gian_phan_hoi) VALUES (3, '1', '27fbca00-a226-4d07-b331-e3c34cd0f63c', 5, 'ok', '0be27c43-8933-45bc-8ef9-b4d6856098cc', '2026-03-13 12:06:17.306794', '2026-03-13 12:06:17.306794', NULL, NULL, NULL);
INSERT INTO orders.danh_gia_san_pham (id, ma_san_pham, ma_nguoi_dung, so_sao, binh_luan, ma_don_hang, ngay_tao, ngay_cap_nhat, phan_hoi_quan_ly, nguoi_phan_hoi, thoi_gian_phan_hoi) VALUES (2, '1', 'b81d9738-535e-4475-884d-aeb3b7324f01', 4, 'rất ngon', 'cb628904-5a9d-4fa7-8cea-4f7848af65fb', '2026-03-12 16:23:04.868871', '2026-03-17 13:23:41.083457', NULL, NULL, NULL);
INSERT INTO orders.danh_gia_san_pham (id, ma_san_pham, ma_nguoi_dung, so_sao, binh_luan, ma_don_hang, ngay_tao, ngay_cap_nhat, phan_hoi_quan_ly, nguoi_phan_hoi, thoi_gian_phan_hoi) VALUES (4, '1', 'b81d9738-535e-4475-884d-aeb3b7324f01', 2, 'ko ok lam', '9f80309f-0c7e-45ed-8e14-86528fc13474', '2026-03-17 13:46:47.331057', '2026-03-17 18:34:42.575739', 'Cam on ban, quan se cai thien chat luong.', 'thaian_manager_macdinhchi', '2026-03-17 18:34:41.915+00');


--
-- Data for Name: don_hang; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('0af2977d-023b-4b1a-9e47-f2debd1c7ce1', 'guest-debug-qr', 25000.00, '57 Nguyen Du, Phuong Ben Nghe, Quan 1, Thanh pho Ho Chi Minh', '18:00 - 19:00', 'debug qr', 'NGAN_HANG_QR', 'CHO_XU_LY', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-17T18:00:56.686Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-17T18:00:56.686Z", "trang_thai": "CHO_XU_LY"}]', '2026-03-17 18:00:56.701573', '2026-03-17 18:00:56.701573', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('5e3b0e5f-7b69-4e01-8732-d940f6823310', 'guest-debug-qr2', 25000.00, '57 Nguyen Du, Quan 1, Thanh pho Ho Chi Minh', '18:00 - 19:00', 'debug qr fallback', 'NGAN_HANG_QR', 'CHO_XU_LY', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-17T18:15:43.102Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-17T18:15:43.102Z", "trang_thai": "CHO_XU_LY"}]', '2026-03-17 18:15:43.106631', '2026-03-17 18:15:43.106631', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('2ff31732-491d-46ad-af06-5948e1a51387', 'b81d9738-535e-4475-884d-aeb3b7324f01', 58000.00, 'KTX Khu A, Dai hoc Cong nghe Moi a', '18:00 - 19:00', 'test', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-13T11:59:57.327Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-13T11:59:57.327Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}]', '2026-03-13 11:59:57.331911', '2026-03-13 11:59:57.331911', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('0be27c43-8933-45bc-8ef9-b4d6856098cc', '27fbca00-a226-4d07-b331-e3c34cd0f63c', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-13T12:06:06.655Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-13T12:06:06.655Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}]', '2026-03-13 12:06:06.658685', '2026-03-13 12:06:06.658685', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('578b04ff-1b70-457b-8909-778f2c44fd79', 'guest-pos-1773511429181', 45000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-14T18:03:49.195Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-14T18:03:49.195Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:08:53.445Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:08:56.826Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:08:56.861Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:08:56.895Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:08:56.895Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-14 18:03:49.193729', '2026-03-14 18:08:56.893158', 'TAI_CHO', NULL, NULL, 'thaian_staff_thegracetower', 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('64cf42ee-0ff8-485c-bacc-681c4f9b314a', 'guest-pos-1773512655214', 45000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-14T18:24:15.229Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-14T18:24:15.229Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:24:19.091Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:24:19.146Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:24:19.183Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:24:19.218Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:24:19.218Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-14 18:24:15.228354', '2026-03-14 18:24:19.216764', 'TAI_CHO', NULL, NULL, 'thaian_staff_thegracetower', 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('6dcb1d79-4a3c-42b4-94b2-eee97df7de78', 'b81d9738-535e-4475-884d-aeb3b7324f01', 70000.00, 'KTX Khu A, Dai hoc Cong nghe Moi aaaa', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'DA_XAC_NHAN', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-13T14:13:54.761Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-13T14:13:54.762Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-13T15:13:47.017Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-13T15:13:48.340Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-13T15:13:51.804Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-13T15:13:54.207Z", "trang_thai": "HOAN_THANH"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-13T15:14:07.657Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-13T15:14:25.793Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-13T15:29:23.685Z", "trang_thai": "DA_XAC_NHAN"}]', '2026-03-13 14:13:54.766014', '2026-03-13 15:29:23.714124', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('e17672c1-948c-4400-8fe2-ed45f9d74f8a', 'guest-pos-1773416546036', 29000.00, 'Mang di tai quay', NULL, 'test pos', 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'DA_XAC_NHAN', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-13T15:42:26.036Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-13T15:42:26.036Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-13 15:42:26.056556', '2026-03-13 15:42:26.056556', 'MANG_DI', NULL, 'Khach Test', 'admin_test', 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('19c8545d-ab54-49d1-a21b-93ca1f2170b9', 'guest-pos-1773416836494', 29000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'DA_XAC_NHAN', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-13T15:47:16.495Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-13T15:47:16.495Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-13 15:47:16.51746', '2026-03-13 15:47:16.51746', 'TAI_CHO', NULL, NULL, 'thaian_admin', 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('327d9e95-d364-4e6e-96b1-9b80d5c337fe', 'guest-pos-1773417714726', 29000.00, 'Tai quay', NULL, NULL, 'NGAN_HANG_QR', 'CHO_XU_LY', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-13T16:01:54.728Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-13T16:01:54.728Z", "trang_thai": "CHO_XU_LY"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-13T16:02:05.482Z", "trang_thai": "HOAN_THANH"}]', '2026-03-13 16:01:54.769739', '2026-03-13 16:02:05.486346', 'TAI_CHO', NULL, NULL, 'thaian_admin', 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('35bef7d9-c1db-410f-8e1e-a21fffe1edb9', 'guest-smoke-905441', 29000.00, 'Test Address', NULL, NULL, 'NGAN_HANG_QR', 'CHO_XU_LY', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-17T18:23:50.487Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-17T18:23:50.487Z", "trang_thai": "CHO_XU_LY"}]', '2026-03-17 18:23:50.501813', '2026-03-17 18:23:50.501813', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('f230b7e1-cb59-4760-92a9-8bdc79b8e4e9', 'b81d9738-535e-4475-884d-aeb3b7324f01', 45000.00, 'KTX Khu A, Dai hoc Cong nghe Moi aaaa', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-14T15:19:21.353Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-14T15:19:21.353Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T15:19:47.489Z", "trang_thai": "HOAN_THANH"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T15:19:57.069Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T15:21:31.247Z", "trang_thai": "MOI_TAO"}]', '2026-03-14 15:19:21.364932', '2026-03-14 15:21:31.251469', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('687d5d6b-850e-4bef-8644-3428a3c579a1', 'b81d9738-535e-4475-884d-aeb3b7324f01', 45000.00, '71 hoàng văn thái, Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'DA_XAC_NHAN', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-14T15:44:14.530Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-14T15:44:14.530Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T16:02:14.141Z", "trang_thai": "HOAN_THANH"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T16:02:33.209Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T16:05:41.134Z", "trang_thai": "DA_XAC_NHAN"}]', '2026-03-14 15:44:14.532803', '2026-03-14 16:05:41.137419', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('ba1d6a75-6409-4bee-a355-24a6b6973f66', 'guest-pos-1773512912410', 45000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'DA_XAC_NHAN', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-14T18:28:32.412Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-14T18:28:32.412Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:28:35.108Z", "trang_thai": "DA_XAC_NHAN"}]', '2026-03-14 18:28:32.411292', '2026-03-14 18:28:35.106933', 'TAI_CHO', NULL, NULL, 'thaian_staff_thegracetower', 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('4f8fa1f0-261a-4388-bbce-956ae00ea049', 'guest-pos-1773517684312', 45000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-14T19:48:04.315Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-14T19:48:04.315Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T19:48:07.454Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T19:48:07.504Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T19:48:07.546Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T19:48:07.584Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T19:48:07.584Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-14 19:48:04.314508', '2026-03-14 19:48:07.583381', 'TAI_CHO', NULL, NULL, 'thaian_staff_thegracetower', 'THE_GRACE_TOWER', 500000.00, 455000.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('358f6f4f-fa2a-463a-ae3a-360bf56a2be7', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, '28 Ter B Mạc Đĩnh Chi, Phường Sài Gòn, Quận 1, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'THAT_BAI', 'DA_HUY', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-17T02:43:26.208Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-17T02:43:26.208Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Khach hang huy don", "thoi_gian": "2026-03-17T02:44:30.836Z", "trang_thai": "DA_HUY"}, {"loai": "PAYMENT", "ghi_chu": "Khach hang huy don", "thoi_gian": "2026-03-17T02:44:30.836Z", "trang_thai": "THAT_BAI"}]', '2026-03-17 02:43:26.21119', '2026-03-17 02:44:30.838562', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('cb628904-5a9d-4fa7-8cea-4f7848af65fb', 'b81d9738-535e-4475-884d-aeb3b7324f01', 1071000.00, '28 Ter B Mạc Đĩnh Chi, Phường Sài Gòn, Quận 1, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-17T03:06:13.374Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-17T03:06:13.374Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:06:34.345Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:06:34.385Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:06:34.414Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:06:34.448Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:06:34.448Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-17 03:06:13.377823', '2026-03-17 03:06:34.447004', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', 1071000.00, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('ca477171-d11e-465e-90c6-351e66cec71c', 'guest-pos-1773717005667', 29000.00, 'Tai quay', NULL, NULL, 'NGAN_HANG_QR', 'CHO_XU_LY', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-17T03:10:05.669Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-17T03:10:05.669Z", "trang_thai": "CHO_XU_LY"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:10:14.623Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T16:50:24.153Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T16:50:24.738Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T16:50:24.877Z", "trang_thai": "HOAN_THANH"}]', '2026-03-17 03:10:05.667413', '2026-03-17 16:50:24.872991', 'TAI_CHO', NULL, NULL, 'thaian_staff_macdinhchi', 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('add48a2f-dd97-41c2-a05a-4b4d66b2ce6c', 'guest-pos-1773767826285', 29000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-17T17:17:06.287Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-17T17:17:06.287Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:17:08.677Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:17:08.720Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:17:08.762Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:17:08.803Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:17:08.803Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-17 17:17:06.286941', '2026-03-17 17:17:08.8018', 'TAI_CHO', NULL, NULL, 'thaian_staff_macdinhchi', 'MAC_DINH_CHI', 29000.00, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('8e89f317-6df9-457d-a4ee-bf36664691f8', 'guest-pos-1773717083248', 29000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-17T03:11:23.249Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-17T03:11:23.249Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:11:26.023Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:11:26.055Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:11:26.088Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:11:26.122Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:11:26.122Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-17 03:11:23.249557', '2026-03-17 03:11:26.120577', 'TAI_CHO', NULL, NULL, 'thaian_staff_macdinhchi', 'MAC_DINH_CHI', 50000.00, 21000.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('df84e119-6e03-47c5-b885-60b49b122a85', 'b81d9738-535e-4475-884d-aeb3b7324f01', 52200.00, '28 Ter B Mạc Đĩnh Chi, Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'CHO_XU_LY', 'MOI_TAO', 'SUMMER2026', 5800.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-17T04:04:54.265Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-17T04:04:54.265Z", "trang_thai": "CHO_XU_LY"}]', '2026-03-17 04:04:54.271624', '2026-03-17 04:04:54.271624', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('9f80309f-0c7e-45ed-8e14-86528fc13474', 'b81d9738-535e-4475-884d-aeb3b7324f01', 58000.00, '28 Ter B Mạc Đĩnh Chi, Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-17T04:07:49.837Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-17T04:07:49.837Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:44:56.038Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:44:56.109Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:44:56.147Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:44:56.191Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:44:56.191Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-17 04:07:49.839506', '2026-03-17 13:44:56.188654', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', 58000.00, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('4e3b5277-955c-4c9a-bd52-e7920c8d959c', 'guest-pos-1773755916028', 29000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-17T13:58:36.044Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-17T13:58:36.044Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:58:38.272Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:58:38.323Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:58:38.369Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:58:38.406Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:58:38.406Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-17 13:58:36.043104', '2026-03-17 13:58:38.405089', 'TAI_CHO', NULL, NULL, 'thaian_staff_macdinhchi', 'MAC_DINH_CHI', 29000.00, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('7b86cb6c-afe6-4130-95c7-550acbc3c1b7', 'guest-pos-1773757918636', 29000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-17T14:31:58.643Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-17T14:31:58.643Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T14:32:00.861Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T14:32:00.912Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T14:32:00.952Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T14:32:00.996Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T14:32:00.996Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-17 14:31:58.640636', '2026-03-17 14:32:00.994289', 'TAI_CHO', NULL, NULL, 'thaian_staff_macdinhchi', 'MAC_DINH_CHI', 50000.00, 21000.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('9159cb4b-974d-4578-bf0d-a0d036f5e4bb', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, '28 Ter B Mạc Đĩnh Chi, Phường Sài Gòn, Quận 1, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-15T16:40:06.603Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-15T16:40:06.603Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:42.340Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:42.824Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:43.028Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:43.132Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:43.132Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-15 16:40:06.61515', '2026-03-17 17:16:43.128254', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', 29000.00, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('421e3fac-b771-463a-800a-ddc5856e9679', 'b81d9738-535e-4475-884d-aeb3b7324f01', 45000.00, '28 Ter B Mạc Đĩnh Chi, Phường Sài Gòn, Quận 1, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-14T15:43:44.299Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-14T15:43:44.299Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:47.144Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:47.183Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:47.213Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:47.237Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:47.237Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-14 15:43:44.309357', '2026-03-17 17:16:47.236529', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', 45000.00, 0.00);


--
-- Data for Name: giao_dich_thanh_toan; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (43, '2ff31732-491d-46ad-af06-5948e1a51387', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-2ff31732-197345', NULL, 58000.00, 'CHO_THU_TIEN', NULL, '2026-03-13 11:59:57.346438');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (44, '0be27c43-8933-45bc-8ef9-b4d6856098cc', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-0be27c43-566672', NULL, 29000.00, 'CHO_THU_TIEN', NULL, '2026-03-13 12:06:06.674487');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (45, '6dcb1d79-4a3c-42b4-94b2-eee97df7de78', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-6dcb1d79-234787', NULL, 70000.00, 'CHO_THU_TIEN', NULL, '2026-03-13 14:13:54.787875');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (46, 'e17672c1-948c-4400-8fe2-ed45f9d74f8a', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-e17672c1-546082', NULL, 29000.00, 'THANH_CONG', NULL, '2026-03-13 15:42:26.082722');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (47, '19c8545d-ab54-49d1-a21b-93ca1f2170b9', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-19c8545d-836532', NULL, 29000.00, 'THANH_CONG', NULL, '2026-03-13 15:47:16.533168');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (48, '327d9e95-d364-4e6e-96b1-9b80d5c337fe', 'NGAN_HANG_QR', 'QR-327d9e95-714813', NULL, 29000.00, 'CHO_THANH_TOAN', NULL, '2026-03-13 16:01:54.814481');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (49, 'f230b7e1-cb59-4760-92a9-8bdc79b8e4e9', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-f230b7e1-561396', NULL, 45000.00, 'CHO_THU_TIEN', NULL, '2026-03-14 15:19:21.397311');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (51, '687d5d6b-850e-4bef-8644-3428a3c579a1', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-687d5d6b-054542', NULL, 45000.00, 'CHO_THU_TIEN', NULL, '2026-03-14 15:44:14.543737');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (52, '578b04ff-1b70-457b-8909-778f2c44fd79', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-578b04ff-429241', NULL, 45000.00, 'THANH_CONG', NULL, '2026-03-14 18:03:49.193729');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (53, '64cf42ee-0ff8-485c-bacc-681c4f9b314a', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-64cf42ee-655278', NULL, 45000.00, 'THANH_CONG', NULL, '2026-03-14 18:24:15.228354');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (54, 'ba1d6a75-6409-4bee-a355-24a6b6973f66', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-ba1d6a75-912445', NULL, 45000.00, 'CHO_THANH_TOAN', NULL, '2026-03-14 18:28:32.411292');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (57, '4f8fa1f0-261a-4388-bbce-956ae00ea049', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-4f8fa1f0-684378', NULL, 45000.00, 'THANH_CONG', NULL, '2026-03-14 19:48:04.314508');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (59, '358f6f4f-fa2a-463a-ae3a-360bf56a2be7', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-358f6f4f-406238', NULL, 29000.00, 'CHO_THU_TIEN', NULL, '2026-03-17 02:43:26.239299');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (60, 'cb628904-5a9d-4fa7-8cea-4f7848af65fb', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-cb628904-773398', NULL, 1071000.00, 'THANH_CONG', NULL, '2026-03-17 03:06:13.400003');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (62, 'ca477171-d11e-465e-90c6-351e66cec71c', 'NGAN_HANG_QR', 'QR-ca477171-005675', NULL, 29000.00, 'CHO_THANH_TOAN', NULL, '2026-03-17 03:10:05.667413');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (63, '8e89f317-6df9-457d-a4ee-bf36664691f8', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-8e89f317-083254', NULL, 29000.00, 'THANH_CONG', NULL, '2026-03-17 03:11:23.249557');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (64, 'df84e119-6e03-47c5-b885-60b49b122a85', 'NGAN_HANG_QR', 'QR-df84e119-294295', NULL, 52200.00, 'CHO_THANH_TOAN', NULL, '2026-03-17 04:04:54.297297');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (65, '9f80309f-0c7e-45ed-8e14-86528fc13474', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-9f80309f-469848', NULL, 58000.00, 'THANH_CONG', NULL, '2026-03-17 04:07:49.849155');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (66, '4e3b5277-955c-4c9a-bd52-e7920c8d959c', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-4e3b5277-916075', NULL, 29000.00, 'THANH_CONG', NULL, '2026-03-17 13:58:36.043104');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (68, '7b86cb6c-afe6-4130-95c7-550acbc3c1b7', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-7b86cb6c-918695', NULL, 29000.00, 'THANH_CONG', NULL, '2026-03-17 14:31:58.640636');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (58, '9159cb4b-974d-4578-bf0d-a0d036f5e4bb', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-9159cb4b-806653', NULL, 29000.00, 'THANH_CONG', NULL, '2026-03-15 16:40:06.658124');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (50, '421e3fac-b771-463a-800a-ddc5856e9679', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-421e3fac-024328', NULL, 45000.00, 'THANH_CONG', NULL, '2026-03-14 15:43:44.330115');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (69, 'add48a2f-dd97-41c2-a05a-4b4d66b2ce6c', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-add48a2f-826305', NULL, 29000.00, 'THANH_CONG', NULL, '2026-03-17 17:17:06.286941');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (70, '0af2977d-023b-4b1a-9e47-f2debd1c7ce1', 'NGAN_HANG_QR', 'QR-0af2977d-456736', NULL, 25000.00, 'CHO_THANH_TOAN', NULL, '2026-03-17 18:00:56.739083');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (71, '5e3b0e5f-7b69-4e01-8732-d940f6823310', 'NGAN_HANG_QR', 'QR-5e3b0e5f-343126', NULL, 25000.00, 'CHO_THANH_TOAN', NULL, '2026-03-17 18:15:43.127044');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (72, '35bef7d9-c1db-410f-8e1e-a21fffe1edb9', 'NGAN_HANG_QR', 'QR-35bef7d9-830533', NULL, 29000.00, 'CHO_THANH_TOAN', NULL, '2026-03-17 18:23:50.535551');


--
-- Data for Name: gio_hang; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.gio_hang (id, ma_nguoi_dung, ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url, kich_co, so_luong) VALUES (75, 'guest-cart-test-51eb8cd8-872d-404b-ab66-64f8c40b868b', 1, 'Ca phe sua da', 29000, 'https://example.com/a.jpg', 'Nh?', 1);
INSERT INTO orders.gio_hang (id, ma_nguoi_dung, ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url, kich_co, so_luong) VALUES (76, 'guest-cart-test-51eb8cd8-872d-404b-ab66-64f8c40b868b', 1, 'Ca phe sua da', 35000, 'https://example.com/a.jpg', 'V?a', 1);
INSERT INTO orders.gio_hang (id, ma_nguoi_dung, ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url, kich_co, so_luong) VALUES (111, 'b81d9738-535e-4475-884d-aeb3b7324f01', 1, 'Cà Phê Sữa Đá', 29000, '/images/products/ca-phe-sua-da.jpg', 'Nhỏ', 1);
INSERT INTO orders.gio_hang (id, ma_nguoi_dung, ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url, kich_co, so_luong) VALUES (112, 'b81d9738-535e-4475-884d-aeb3b7324f01', 2, 'Trà Đào Cam Sả', 45000, '/images/products/tra-dao-cam-sa.jpg', 'Nhỏ', 1);
INSERT INTO orders.gio_hang (id, ma_nguoi_dung, ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url, kich_co, so_luong) VALUES (113, 'b81d9738-535e-4475-884d-aeb3b7324f01', 4, 'Espresso Đá', 49000, '/images/products/espresso-a.png', 'Nhỏ', 1);


--
-- Data for Name: thong_bao; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (19, '27fbca00-a226-4d07-b331-e3c34cd0f63c', 'Don hang da duoc tao', 'Don #0be27c43-8933-45bc-8ef9-b4d6856098cc da duoc tao thanh cong.', 'ORDER', false, '{"ma_don_hang": "0be27c43-8933-45bc-8ef9-b4d6856098cc", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-13 12:06:06.679425+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (20, '27fbca00-a226-4d07-b331-e3c34cd0f63c', 'Don COD cho thu tien', 'Don #0be27c43-8933-45bc-8ef9-b4d6856098cc se duoc thu tien khi giao hang.', 'PAYMENT', false, '{"ma_don_hang": "0be27c43-8933-45bc-8ef9-b4d6856098cc", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-13 12:06:06.697622+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (30, 'guest-pos-1773417714726', 'Cap nhat trang thai don hang', 'Don #327d9e95-d364-4e6e-96b1-9b80d5c337fe da chuyen sang trang thai HOAN_THANH.', 'ORDER', false, '{"ma_don_hang": "327d9e95-d364-4e6e-96b1-9b80d5c337fe", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-13 16:02:05.499807+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (43, 'guest-pos-1773511429181', 'Cap nhat trang thai don hang', 'Don #578b04ff-1b70-457b-8909-778f2c44fd79 da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', false, '{"ma_don_hang": "578b04ff-1b70-457b-8909-778f2c44fd79", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-14 18:08:53.506473+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (44, 'guest-pos-1773511429181', 'Cap nhat trang thai don hang', 'Don #578b04ff-1b70-457b-8909-778f2c44fd79 da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', false, '{"ma_don_hang": "578b04ff-1b70-457b-8909-778f2c44fd79", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-14 18:08:56.841481+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (45, 'guest-pos-1773511429181', 'Cap nhat trang thai don hang', 'Don #578b04ff-1b70-457b-8909-778f2c44fd79 da chuyen sang trang thai DANG_GIAO.', 'ORDER', false, '{"ma_don_hang": "578b04ff-1b70-457b-8909-778f2c44fd79", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-14 18:08:56.869834+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (46, 'guest-pos-1773511429181', 'Cap nhat trang thai don hang', 'Don #578b04ff-1b70-457b-8909-778f2c44fd79 da chuyen sang trang thai HOAN_THANH.', 'ORDER', false, '{"ma_don_hang": "578b04ff-1b70-457b-8909-778f2c44fd79", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-14 18:08:56.910699+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (47, 'guest-pos-1773512655214', 'Cap nhat trang thai don hang', 'Don #64cf42ee-0ff8-485c-bacc-681c4f9b314a da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', false, '{"ma_don_hang": "64cf42ee-0ff8-485c-bacc-681c4f9b314a", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-14 18:24:19.112778+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (48, 'guest-pos-1773512655214', 'Cap nhat trang thai don hang', 'Don #64cf42ee-0ff8-485c-bacc-681c4f9b314a da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', false, '{"ma_don_hang": "64cf42ee-0ff8-485c-bacc-681c4f9b314a", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-14 18:24:19.15361+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (49, 'guest-pos-1773512655214', 'Cap nhat trang thai don hang', 'Don #64cf42ee-0ff8-485c-bacc-681c4f9b314a da chuyen sang trang thai DANG_GIAO.', 'ORDER', false, '{"ma_don_hang": "64cf42ee-0ff8-485c-bacc-681c4f9b314a", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-14 18:24:19.197258+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (50, 'guest-pos-1773512655214', 'Cap nhat trang thai don hang', 'Don #64cf42ee-0ff8-485c-bacc-681c4f9b314a da chuyen sang trang thai HOAN_THANH.', 'ORDER', false, '{"ma_don_hang": "64cf42ee-0ff8-485c-bacc-681c4f9b314a", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-14 18:24:19.231917+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (51, 'guest-pos-1773512912410', 'Cap nhat trang thai don hang', 'Don #ba1d6a75-6409-4bee-a355-24a6b6973f66 da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', false, '{"ma_don_hang": "ba1d6a75-6409-4bee-a355-24a6b6973f66", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-14 18:28:35.161414+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (52, 'guest-pos-1773514031376', 'Cap nhat trang thai don hang', 'Don #5468c683-8e90-45a0-98ce-2b28b0701427 da chuyen sang trang thai DA_HUY.', 'ORDER', false, '{"ma_don_hang": "5468c683-8e90-45a0-98ce-2b28b0701427", "trang_thai_don_hang": "DA_HUY"}', '2026-03-14 18:47:48.914079+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (53, 'guest-pos-1773517684312', 'Cap nhat trang thai don hang', 'Don #4f8fa1f0-261a-4388-bbce-956ae00ea049 da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', false, '{"ma_don_hang": "4f8fa1f0-261a-4388-bbce-956ae00ea049", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-14 19:48:07.473998+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (54, 'guest-pos-1773517684312', 'Cap nhat trang thai don hang', 'Don #4f8fa1f0-261a-4388-bbce-956ae00ea049 da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', false, '{"ma_don_hang": "4f8fa1f0-261a-4388-bbce-956ae00ea049", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-14 19:48:07.517397+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (55, 'guest-pos-1773517684312', 'Cap nhat trang thai don hang', 'Don #4f8fa1f0-261a-4388-bbce-956ae00ea049 da chuyen sang trang thai DANG_GIAO.', 'ORDER', false, '{"ma_don_hang": "4f8fa1f0-261a-4388-bbce-956ae00ea049", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-14 19:48:07.557721+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (56, 'guest-pos-1773517684312', 'Cap nhat trang thai don hang', 'Don #4f8fa1f0-261a-4388-bbce-956ae00ea049 da chuyen sang trang thai HOAN_THANH.', 'ORDER', false, '{"ma_don_hang": "4f8fa1f0-261a-4388-bbce-956ae00ea049", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-14 19:48:07.59924+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (17, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #2ff31732-491d-46ad-af06-5948e1a51387 da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "2ff31732-491d-46ad-af06-5948e1a51387", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-13 11:59:57.353985+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (18, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #2ff31732-491d-46ad-af06-5948e1a51387 se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "2ff31732-491d-46ad-af06-5948e1a51387", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-13 11:59:57.382031+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (21, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #6dcb1d79-4a3c-42b4-94b2-eee97df7de78 da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "6dcb1d79-4a3c-42b4-94b2-eee97df7de78", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-13 14:13:54.793364+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (22, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #6dcb1d79-4a3c-42b4-94b2-eee97df7de78 se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "6dcb1d79-4a3c-42b4-94b2-eee97df7de78", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-13 14:13:54.859536+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (23, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #6dcb1d79-4a3c-42b4-94b2-eee97df7de78 da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', true, '{"ma_don_hang": "6dcb1d79-4a3c-42b4-94b2-eee97df7de78", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-13 15:13:47.069826+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (24, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #6dcb1d79-4a3c-42b4-94b2-eee97df7de78 da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', true, '{"ma_don_hang": "6dcb1d79-4a3c-42b4-94b2-eee97df7de78", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-13 15:13:48.348517+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (25, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #6dcb1d79-4a3c-42b4-94b2-eee97df7de78 da chuyen sang trang thai DANG_GIAO.', 'ORDER', true, '{"ma_don_hang": "6dcb1d79-4a3c-42b4-94b2-eee97df7de78", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-13 15:13:51.811325+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (26, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #6dcb1d79-4a3c-42b4-94b2-eee97df7de78 da chuyen sang trang thai HOAN_THANH.', 'ORDER', true, '{"ma_don_hang": "6dcb1d79-4a3c-42b4-94b2-eee97df7de78", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-13 15:13:54.213891+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (27, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #6dcb1d79-4a3c-42b4-94b2-eee97df7de78 da chuyen sang trang thai DANG_GIAO.', 'ORDER', true, '{"ma_don_hang": "6dcb1d79-4a3c-42b4-94b2-eee97df7de78", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-13 15:14:07.663746+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (28, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #6dcb1d79-4a3c-42b4-94b2-eee97df7de78 da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', true, '{"ma_don_hang": "6dcb1d79-4a3c-42b4-94b2-eee97df7de78", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-13 15:14:25.801583+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (29, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #6dcb1d79-4a3c-42b4-94b2-eee97df7de78 da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', true, '{"ma_don_hang": "6dcb1d79-4a3c-42b4-94b2-eee97df7de78", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-13 15:29:23.736514+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (31, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #f230b7e1-cb59-4760-92a9-8bdc79b8e4e9 da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "f230b7e1-cb59-4760-92a9-8bdc79b8e4e9", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-14 15:19:21.406577+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (32, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #f230b7e1-cb59-4760-92a9-8bdc79b8e4e9 se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "f230b7e1-cb59-4760-92a9-8bdc79b8e4e9", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-14 15:19:21.49952+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (33, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #f230b7e1-cb59-4760-92a9-8bdc79b8e4e9 da chuyen sang trang thai HOAN_THANH.', 'ORDER', true, '{"ma_don_hang": "f230b7e1-cb59-4760-92a9-8bdc79b8e4e9", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-14 15:19:47.503732+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (34, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #f230b7e1-cb59-4760-92a9-8bdc79b8e4e9 da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', true, '{"ma_don_hang": "f230b7e1-cb59-4760-92a9-8bdc79b8e4e9", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-14 15:19:57.149555+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (35, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #f230b7e1-cb59-4760-92a9-8bdc79b8e4e9 da chuyen sang trang thai MOI_TAO.', 'ORDER', true, '{"ma_don_hang": "f230b7e1-cb59-4760-92a9-8bdc79b8e4e9", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-14 15:21:31.267496+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (36, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #421e3fac-b771-463a-800a-ddc5856e9679 da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "421e3fac-b771-463a-800a-ddc5856e9679", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-14 15:43:44.337281+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (37, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #421e3fac-b771-463a-800a-ddc5856e9679 se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "421e3fac-b771-463a-800a-ddc5856e9679", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-14 15:43:44.443266+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (38, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #687d5d6b-850e-4bef-8644-3428a3c579a1 da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "687d5d6b-850e-4bef-8644-3428a3c579a1", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-14 15:44:14.548501+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (39, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #687d5d6b-850e-4bef-8644-3428a3c579a1 se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "687d5d6b-850e-4bef-8644-3428a3c579a1", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-14 15:44:14.556365+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (40, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #687d5d6b-850e-4bef-8644-3428a3c579a1 da chuyen sang trang thai HOAN_THANH.', 'ORDER', true, '{"ma_don_hang": "687d5d6b-850e-4bef-8644-3428a3c579a1", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-14 16:02:14.181669+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (41, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #687d5d6b-850e-4bef-8644-3428a3c579a1 da chuyen sang trang thai DANG_GIAO.', 'ORDER', true, '{"ma_don_hang": "687d5d6b-850e-4bef-8644-3428a3c579a1", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-14 16:02:33.215889+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (42, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #687d5d6b-850e-4bef-8644-3428a3c579a1 da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', true, '{"ma_don_hang": "687d5d6b-850e-4bef-8644-3428a3c579a1", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-14 16:05:41.144172+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (57, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #9159cb4b-974d-4578-bf0d-a0d036f5e4bb da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "9159cb4b-974d-4578-bf0d-a0d036f5e4bb", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-15 16:40:06.670011+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (58, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #9159cb4b-974d-4578-bf0d-a0d036f5e4bb se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "9159cb4b-974d-4578-bf0d-a0d036f5e4bb", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-15 16:40:06.857028+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (68, 'guest-pos-1773717005667', 'Cap nhat trang thai don hang', 'Don #ca477171-d11e-465e-90c6-351e66cec71c da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', false, '{"ma_don_hang": "ca477171-d11e-465e-90c6-351e66cec71c", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-17 03:10:14.631795+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (69, 'guest-pos-1773717083248', 'Cap nhat trang thai don hang', 'Don #8e89f317-6df9-457d-a4ee-bf36664691f8 da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', false, '{"ma_don_hang": "8e89f317-6df9-457d-a4ee-bf36664691f8", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-17 03:11:26.030156+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (70, 'guest-pos-1773717083248', 'Cap nhat trang thai don hang', 'Don #8e89f317-6df9-457d-a4ee-bf36664691f8 da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', false, '{"ma_don_hang": "8e89f317-6df9-457d-a4ee-bf36664691f8", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-17 03:11:26.062125+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (71, 'guest-pos-1773717083248', 'Cap nhat trang thai don hang', 'Don #8e89f317-6df9-457d-a4ee-bf36664691f8 da chuyen sang trang thai DANG_GIAO.', 'ORDER', false, '{"ma_don_hang": "8e89f317-6df9-457d-a4ee-bf36664691f8", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-17 03:11:26.095685+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (72, 'guest-pos-1773717083248', 'Cap nhat trang thai don hang', 'Don #8e89f317-6df9-457d-a4ee-bf36664691f8 da chuyen sang trang thai HOAN_THANH.', 'ORDER', false, '{"ma_don_hang": "8e89f317-6df9-457d-a4ee-bf36664691f8", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-17 03:11:26.140172+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (59, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #358f6f4f-fa2a-463a-ae3a-360bf56a2be7 da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "358f6f4f-fa2a-463a-ae3a-360bf56a2be7", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-17 02:43:26.249907+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (60, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #358f6f4f-fa2a-463a-ae3a-360bf56a2be7 se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "358f6f4f-fa2a-463a-ae3a-360bf56a2be7", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-17 02:43:26.321382+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (61, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da huy', 'Don #358f6f4f-fa2a-463a-ae3a-360bf56a2be7 da duoc huy.', 'ORDER', true, '{"ma_don_hang": "358f6f4f-fa2a-463a-ae3a-360bf56a2be7", "trang_thai_don_hang": "DA_HUY"}', '2026-03-17 02:44:30.846903+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (62, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #cb628904-5a9d-4fa7-8cea-4f7848af65fb da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "cb628904-5a9d-4fa7-8cea-4f7848af65fb", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-17 03:06:13.407059+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (63, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #cb628904-5a9d-4fa7-8cea-4f7848af65fb se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "cb628904-5a9d-4fa7-8cea-4f7848af65fb", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-17 03:06:13.431743+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (64, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #cb628904-5a9d-4fa7-8cea-4f7848af65fb da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', true, '{"ma_don_hang": "cb628904-5a9d-4fa7-8cea-4f7848af65fb", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-17 03:06:34.355679+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (65, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #cb628904-5a9d-4fa7-8cea-4f7848af65fb da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', true, '{"ma_don_hang": "cb628904-5a9d-4fa7-8cea-4f7848af65fb", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-17 03:06:34.393856+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (66, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #cb628904-5a9d-4fa7-8cea-4f7848af65fb da chuyen sang trang thai DANG_GIAO.', 'ORDER', true, '{"ma_don_hang": "cb628904-5a9d-4fa7-8cea-4f7848af65fb", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-17 03:06:34.424722+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (67, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #cb628904-5a9d-4fa7-8cea-4f7848af65fb da chuyen sang trang thai HOAN_THANH.', 'ORDER', true, '{"ma_don_hang": "cb628904-5a9d-4fa7-8cea-4f7848af65fb", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-17 03:06:34.467051+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (82, 'guest-pos-1773755916028', 'Cap nhat trang thai don hang', 'Don #4e3b5277-955c-4c9a-bd52-e7920c8d959c da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', false, '{"ma_don_hang": "4e3b5277-955c-4c9a-bd52-e7920c8d959c", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-17 13:58:38.285015+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (83, 'guest-pos-1773755916028', 'Cap nhat trang thai don hang', 'Don #4e3b5277-955c-4c9a-bd52-e7920c8d959c da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', false, '{"ma_don_hang": "4e3b5277-955c-4c9a-bd52-e7920c8d959c", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-17 13:58:38.33443+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (84, 'guest-pos-1773755916028', 'Cap nhat trang thai don hang', 'Don #4e3b5277-955c-4c9a-bd52-e7920c8d959c da chuyen sang trang thai DANG_GIAO.', 'ORDER', false, '{"ma_don_hang": "4e3b5277-955c-4c9a-bd52-e7920c8d959c", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-17 13:58:38.378856+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (85, 'guest-pos-1773755916028', 'Cap nhat trang thai don hang', 'Don #4e3b5277-955c-4c9a-bd52-e7920c8d959c da chuyen sang trang thai HOAN_THANH.', 'ORDER', false, '{"ma_don_hang": "4e3b5277-955c-4c9a-bd52-e7920c8d959c", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-17 13:58:38.414749+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (86, 'guest-pos-1773757753382', 'Cap nhat trang thai don hang', 'Don #ea28a23a-bf42-4317-81d6-a8e5a7d3ac0a da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', false, '{"ma_don_hang": "ea28a23a-bf42-4317-81d6-a8e5a7d3ac0a", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-17 14:29:15.554097+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (87, 'guest-pos-1773757753382', 'Cap nhat trang thai don hang', 'Don #ea28a23a-bf42-4317-81d6-a8e5a7d3ac0a da chuyen sang trang thai DA_HUY.', 'ORDER', false, '{"ma_don_hang": "ea28a23a-bf42-4317-81d6-a8e5a7d3ac0a", "trang_thai_don_hang": "DA_HUY"}', '2026-03-17 14:29:26.754964+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (88, 'guest-pos-1773757918636', 'Cap nhat trang thai don hang', 'Don #7b86cb6c-afe6-4130-95c7-550acbc3c1b7 da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', false, '{"ma_don_hang": "7b86cb6c-afe6-4130-95c7-550acbc3c1b7", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-17 14:32:00.879615+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (89, 'guest-pos-1773757918636', 'Cap nhat trang thai don hang', 'Don #7b86cb6c-afe6-4130-95c7-550acbc3c1b7 da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', false, '{"ma_don_hang": "7b86cb6c-afe6-4130-95c7-550acbc3c1b7", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-17 14:32:00.925424+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (90, 'guest-pos-1773757918636', 'Cap nhat trang thai don hang', 'Don #7b86cb6c-afe6-4130-95c7-550acbc3c1b7 da chuyen sang trang thai DANG_GIAO.', 'ORDER', false, '{"ma_don_hang": "7b86cb6c-afe6-4130-95c7-550acbc3c1b7", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-17 14:32:00.965095+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (91, 'guest-pos-1773757918636', 'Cap nhat trang thai don hang', 'Don #7b86cb6c-afe6-4130-95c7-550acbc3c1b7 da chuyen sang trang thai HOAN_THANH.', 'ORDER', false, '{"ma_don_hang": "7b86cb6c-afe6-4130-95c7-550acbc3c1b7", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-17 14:32:01.019477+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (73, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #df84e119-6e03-47c5-b885-60b49b122a85 da duoc tao thanh cong. Giam gia: 5.800d', 'ORDER', true, '{"ma_don_hang": "df84e119-6e03-47c5-b885-60b49b122a85", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-17 04:04:54.459985+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (74, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Da tao ma QR ngan hang', 'Don #df84e119-6e03-47c5-b885-60b49b122a85 da san sang thanh toan qua QR.', 'PAYMENT', true, '{"ma_don_hang": "df84e119-6e03-47c5-b885-60b49b122a85", "phuong_thuc_thanh_toan": "NGAN_HANG_QR"}', '2026-03-17 04:04:54.477976+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (75, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #9f80309f-0c7e-45ed-8e14-86528fc13474 da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "9f80309f-0c7e-45ed-8e14-86528fc13474", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-17 04:07:49.852458+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (76, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #9f80309f-0c7e-45ed-8e14-86528fc13474 se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "9f80309f-0c7e-45ed-8e14-86528fc13474", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-17 04:07:49.868189+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (77, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc cap nhat', 'Don #9f80309f-0c7e-45ed-8e14-86528fc13474 da duoc chinh sua truoc khi xac nhan.', 'ORDER', true, '{"ma_don_hang": "9f80309f-0c7e-45ed-8e14-86528fc13474", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-17 13:40:55.736037+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (78, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #9f80309f-0c7e-45ed-8e14-86528fc13474 da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', true, '{"ma_don_hang": "9f80309f-0c7e-45ed-8e14-86528fc13474", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-17 13:44:56.068376+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (79, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #9f80309f-0c7e-45ed-8e14-86528fc13474 da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', true, '{"ma_don_hang": "9f80309f-0c7e-45ed-8e14-86528fc13474", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-17 13:44:56.120531+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (80, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #9f80309f-0c7e-45ed-8e14-86528fc13474 da chuyen sang trang thai DANG_GIAO.', 'ORDER', true, '{"ma_don_hang": "9f80309f-0c7e-45ed-8e14-86528fc13474", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-17 13:44:56.158815+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (81, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #9f80309f-0c7e-45ed-8e14-86528fc13474 da chuyen sang trang thai HOAN_THANH.', 'ORDER', true, '{"ma_don_hang": "9f80309f-0c7e-45ed-8e14-86528fc13474", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-17 13:44:56.212214+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (92, 'guest-pos-1773717005667', 'Cap nhat trang thai don hang', 'Don #ca477171-d11e-465e-90c6-351e66cec71c da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', false, '{"ma_don_hang": "ca477171-d11e-465e-90c6-351e66cec71c", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-17 16:50:24.579013+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (93, 'guest-pos-1773717005667', 'Cap nhat trang thai don hang', 'Don #ca477171-d11e-465e-90c6-351e66cec71c da chuyen sang trang thai DANG_GIAO.', 'ORDER', false, '{"ma_don_hang": "ca477171-d11e-465e-90c6-351e66cec71c", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-17 16:50:24.75995+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (94, 'guest-pos-1773717005667', 'Cap nhat trang thai don hang', 'Don #ca477171-d11e-465e-90c6-351e66cec71c da chuyen sang trang thai HOAN_THANH.', 'ORDER', false, '{"ma_don_hang": "ca477171-d11e-465e-90c6-351e66cec71c", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-17 16:50:24.902479+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (95, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #9159cb4b-974d-4578-bf0d-a0d036f5e4bb da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', false, '{"ma_don_hang": "9159cb4b-974d-4578-bf0d-a0d036f5e4bb", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-17 17:16:42.620613+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (96, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #9159cb4b-974d-4578-bf0d-a0d036f5e4bb da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', false, '{"ma_don_hang": "9159cb4b-974d-4578-bf0d-a0d036f5e4bb", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-17 17:16:42.876873+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (97, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #9159cb4b-974d-4578-bf0d-a0d036f5e4bb da chuyen sang trang thai DANG_GIAO.', 'ORDER', false, '{"ma_don_hang": "9159cb4b-974d-4578-bf0d-a0d036f5e4bb", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-17 17:16:43.072346+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (98, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #9159cb4b-974d-4578-bf0d-a0d036f5e4bb da chuyen sang trang thai HOAN_THANH.', 'ORDER', false, '{"ma_don_hang": "9159cb4b-974d-4578-bf0d-a0d036f5e4bb", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-17 17:16:43.240854+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (99, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #421e3fac-b771-463a-800a-ddc5856e9679 da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', false, '{"ma_don_hang": "421e3fac-b771-463a-800a-ddc5856e9679", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-17 17:16:47.158811+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (100, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #421e3fac-b771-463a-800a-ddc5856e9679 da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', false, '{"ma_don_hang": "421e3fac-b771-463a-800a-ddc5856e9679", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-17 17:16:47.190163+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (101, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #421e3fac-b771-463a-800a-ddc5856e9679 da chuyen sang trang thai DANG_GIAO.', 'ORDER', false, '{"ma_don_hang": "421e3fac-b771-463a-800a-ddc5856e9679", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-17 17:16:47.218859+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (102, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #421e3fac-b771-463a-800a-ddc5856e9679 da chuyen sang trang thai HOAN_THANH.', 'ORDER', false, '{"ma_don_hang": "421e3fac-b771-463a-800a-ddc5856e9679", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-17 17:16:47.261475+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (103, 'guest-pos-1773767826285', 'Cap nhat trang thai don hang', 'Don #add48a2f-dd97-41c2-a05a-4b4d66b2ce6c da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', false, '{"ma_don_hang": "add48a2f-dd97-41c2-a05a-4b4d66b2ce6c", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-17 17:17:08.686764+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (104, 'guest-pos-1773767826285', 'Cap nhat trang thai don hang', 'Don #add48a2f-dd97-41c2-a05a-4b4d66b2ce6c da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', false, '{"ma_don_hang": "add48a2f-dd97-41c2-a05a-4b4d66b2ce6c", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-17 17:17:08.72745+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (105, 'guest-pos-1773767826285', 'Cap nhat trang thai don hang', 'Don #add48a2f-dd97-41c2-a05a-4b4d66b2ce6c da chuyen sang trang thai DANG_GIAO.', 'ORDER', false, '{"ma_don_hang": "add48a2f-dd97-41c2-a05a-4b4d66b2ce6c", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-17 17:17:08.773442+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (106, 'guest-pos-1773767826285', 'Cap nhat trang thai don hang', 'Don #add48a2f-dd97-41c2-a05a-4b4d66b2ce6c da chuyen sang trang thai HOAN_THANH.', 'ORDER', false, '{"ma_don_hang": "add48a2f-dd97-41c2-a05a-4b4d66b2ce6c", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-17 17:17:08.834476+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (107, 'guest-debug-qr', 'Don hang da duoc tao', 'Don #0af2977d-023b-4b1a-9e47-f2debd1c7ce1 da duoc tao thanh cong.', 'ORDER', false, '{"ma_don_hang": "0af2977d-023b-4b1a-9e47-f2debd1c7ce1", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-17 18:00:56.747427+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (108, 'guest-debug-qr', 'Da tao ma QR ngan hang', 'Don #0af2977d-023b-4b1a-9e47-f2debd1c7ce1 da san sang thanh toan qua QR.', 'PAYMENT', false, '{"ma_don_hang": "0af2977d-023b-4b1a-9e47-f2debd1c7ce1", "phuong_thuc_thanh_toan": "NGAN_HANG_QR"}', '2026-03-17 18:00:56.81067+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (109, 'guest-debug-qr2', 'Don hang da duoc tao', 'Don #5e3b0e5f-7b69-4e01-8732-d940f6823310 da duoc tao thanh cong.', 'ORDER', false, '{"ma_don_hang": "5e3b0e5f-7b69-4e01-8732-d940f6823310", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-17 18:15:43.135469+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (110, 'guest-debug-qr2', 'Da tao ma QR ngan hang', 'Don #5e3b0e5f-7b69-4e01-8732-d940f6823310 da san sang thanh toan qua QR.', 'PAYMENT', false, '{"ma_don_hang": "5e3b0e5f-7b69-4e01-8732-d940f6823310", "phuong_thuc_thanh_toan": "NGAN_HANG_QR"}', '2026-03-17 18:15:43.158817+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (111, 'guest-smoke-905441', 'Don hang da duoc tao', 'Don #35bef7d9-c1db-410f-8e1e-a21fffe1edb9 da duoc tao thanh cong.', 'ORDER', false, '{"ma_don_hang": "35bef7d9-c1db-410f-8e1e-a21fffe1edb9", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-17 18:23:50.542736+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (112, 'guest-smoke-905441', 'Da tao ma QR ngan hang', 'Don #35bef7d9-c1db-410f-8e1e-a21fffe1edb9 da san sang thanh toan qua QR.', 'PAYMENT', false, '{"ma_don_hang": "35bef7d9-c1db-410f-8e1e-a21fffe1edb9", "phuong_thuc_thanh_toan": "NGAN_HANG_QR"}', '2026-03-17 18:23:50.578906+00');


--
-- Data for Name: voucher; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.voucher (id, ma_voucher, mo_ta, loai, gia_tri, giam_toi_da, don_hang_toi_thieu, tong_luot_dung, luot_da_dung, han_su_dung, trang_thai, ngay_tao, ngay_cap_nhat) VALUES (2, 'SAVE20K', 'Giam thang 20,000d cho don tu 100,000d', 'AMOUNT', 20000.00, NULL, 100000.00, 50, 0, NULL, 'ACTIVE', '2026-03-12 17:38:13.425679', '2026-03-12 17:38:13.425679');
INSERT INTO orders.voucher (id, ma_voucher, mo_ta, loai, gia_tri, giam_toi_da, don_hang_toi_thieu, tong_luot_dung, luot_da_dung, han_su_dung, trang_thai, ngay_tao, ngay_cap_nhat) VALUES (3, 'FREESHIP', 'Giam phi giao hang 15,000d', 'AMOUNT', 15000.00, NULL, 0.00, NULL, 0, NULL, 'ACTIVE', '2026-03-12 17:38:13.425679', '2026-03-12 17:38:13.425679');
INSERT INTO orders.voucher (id, ma_voucher, mo_ta, loai, gia_tri, giam_toi_da, don_hang_toi_thieu, tong_luot_dung, luot_da_dung, han_su_dung, trang_thai, ngay_tao, ngay_cap_nhat) VALUES (1, 'WELCOME10', 'Giam 10% cho don hang dau tien', 'PERCENT', 10.00, 50000.00, 0.00, 100, 1, NULL, 'ACTIVE', '2026-03-12 17:38:13.425679', '2026-03-12 17:49:37.003667');


--
-- Name: dia_chi_giao_hang_id_seq; Type: SEQUENCE SET; Schema: identity; Owner: admin
--

SELECT pg_catalog.setval('identity.dia_chi_giao_hang_id_seq', 3, true);


--
-- Name: khuyen_mai_su_dung_id_seq; Type: SEQUENCE SET; Schema: identity; Owner: admin
--

SELECT pg_catalog.setval('identity.khuyen_mai_su_dung_id_seq', 1, true);


--
-- Name: ton_kho_san_pham_id_seq; Type: SEQUENCE SET; Schema: inventory; Owner: admin
--

SELECT pg_catalog.setval('inventory.ton_kho_san_pham_id_seq', 4, true);


--
-- Name: danh_muc_ma_danh_muc_seq; Type: SEQUENCE SET; Schema: menu; Owner: admin
--

SELECT pg_catalog.setval('menu.danh_muc_ma_danh_muc_seq', 3, true);


--
-- Name: san_pham_ma_san_pham_seq; Type: SEQUENCE SET; Schema: menu; Owner: admin
--

SELECT pg_catalog.setval('menu.san_pham_ma_san_pham_seq', 6, true);


--
-- Name: chat_message_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.chat_message_id_seq', 12, true);


--
-- Name: chi_tiet_don_hang_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.chi_tiet_don_hang_id_seq', 83, true);


--
-- Name: danh_gia_san_pham_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.danh_gia_san_pham_id_seq', 4, true);


--
-- Name: giao_dich_thanh_toan_ma_giao_dich_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.giao_dich_thanh_toan_ma_giao_dich_seq', 72, true);


--
-- Name: gio_hang_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.gio_hang_id_seq', 117, true);


--
-- Name: thong_bao_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.thong_bao_id_seq', 112, true);


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
-- Name: khuyen_mai PK_41b39161335099ba97f897da482; Type: CONSTRAINT; Schema: identity; Owner: admin
--

ALTER TABLE ONLY identity.khuyen_mai
    ADD CONSTRAINT "PK_41b39161335099ba97f897da482" PRIMARY KEY (ma_khuyen_mai);


--
-- Name: khuyen_mai_su_dung PK_709a2cbc73933aab4ab86624135; Type: CONSTRAINT; Schema: identity; Owner: admin
--

ALTER TABLE ONLY identity.khuyen_mai_su_dung
    ADD CONSTRAINT "PK_709a2cbc73933aab4ab86624135" PRIMARY KEY (id);


--
-- Name: nguoi_dung PK_dc056ebc44f20f41b5e7aded3f1; Type: CONSTRAINT; Schema: identity; Owner: admin
--

ALTER TABLE ONLY identity.nguoi_dung
    ADD CONSTRAINT "PK_dc056ebc44f20f41b5e7aded3f1" PRIMARY KEY (ma_nguoi_dung);


--
-- Name: chi_nhanh PK_fe39e450fa646ce1f89b1e2af7d; Type: CONSTRAINT; Schema: identity; Owner: admin
--

ALTER TABLE ONLY identity.chi_nhanh
    ADD CONSTRAINT "PK_fe39e450fa646ce1f89b1e2af7d" PRIMARY KEY (ma_chi_nhanh);


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
-- Name: chi_nhanh UQ_92c71d2bf8018e62b16682673eb; Type: CONSTRAINT; Schema: identity; Owner: admin
--

ALTER TABLE ONLY identity.chi_nhanh
    ADD CONSTRAINT "UQ_92c71d2bf8018e62b16682673eb" UNIQUE (ten_chi_nhanh);


--
-- Name: ton_kho_san_pham PK_b1794f4d5a33ad03a9b6e4a5cdf; Type: CONSTRAINT; Schema: inventory; Owner: admin
--

ALTER TABLE ONLY inventory.ton_kho_san_pham
    ADD CONSTRAINT "PK_b1794f4d5a33ad03a9b6e4a5cdf" PRIMARY KEY (id);


--
-- Name: ton_kho_san_pham uq_ton_kho_san_pham_branch_product; Type: CONSTRAINT; Schema: inventory; Owner: admin
--

ALTER TABLE ONLY inventory.ton_kho_san_pham
    ADD CONSTRAINT uq_ton_kho_san_pham_branch_product UNIQUE (co_so_ma, ma_san_pham);


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
-- Name: ca_doi_soat PK_17fdd7631a1659783f213195d64; Type: CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.ca_doi_soat
    ADD CONSTRAINT "PK_17fdd7631a1659783f213195d64" PRIMARY KEY (ma_ca);


--
-- Name: chat_message PK_3cc0d85193aade457d3077dd06b; Type: CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.chat_message
    ADD CONSTRAINT "PK_3cc0d85193aade457d3077dd06b" PRIMARY KEY (id);


--
-- Name: gio_hang PK_40a78fdbcb9b367d66290748c4a; Type: CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.gio_hang
    ADD CONSTRAINT "PK_40a78fdbcb9b367d66290748c4a" PRIMARY KEY (id);


--
-- Name: chat_conversation PK_4185724cfd0d457eab0e1494374; Type: CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.chat_conversation
    ADD CONSTRAINT "PK_4185724cfd0d457eab0e1494374" PRIMARY KEY (ma_hoi_thoai);


--
-- Name: voucher PK_677ae75f380e81c2f103a57ffaf; Type: CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.voucher
    ADD CONSTRAINT "PK_677ae75f380e81c2f103a57ffaf" PRIMARY KEY (id);


--
-- Name: ca_lam_viec_nhan_vien PK_68405207ec37fdac07fddb016ab; Type: CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.ca_lam_viec_nhan_vien
    ADD CONSTRAINT "PK_68405207ec37fdac07fddb016ab" PRIMARY KEY (ma_ca_lam_viec);


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
-- Name: IDX_1b94b4f95399086a3b5362084e; Type: INDEX; Schema: identity; Owner: admin
--

CREATE INDEX "IDX_1b94b4f95399086a3b5362084e" ON identity.khuyen_mai_su_dung USING btree (ma_khuyen_mai, ma_nguoi_dung);


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

\unrestrict Wye4707toXYgdc9jCONz8Ck9DdWvcH9UQ4mgLbsPMdu2r6tADIhPKZHMmLc5860

