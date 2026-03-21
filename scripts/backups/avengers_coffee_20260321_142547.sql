--
-- PostgreSQL database dump
--

\restrict R5Xf5scjLd8QJkYpBqX3hnmwTDFnZxPXYl4X2lvNgWgJbelSDDe1obKQMCU28Fe

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
-- Name: ai; Type: SCHEMA; Schema: -; Owner: admin
--

CREATE SCHEMA ai;


ALTER SCHEMA ai OWNER TO admin;

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
-- Name: menu_ci_local; Type: SCHEMA; Schema: -; Owner: admin
--

CREATE SCHEMA menu_ci_local;


ALTER SCHEMA menu_ci_local OWNER TO admin;

--
-- Name: news; Type: SCHEMA; Schema: -; Owner: admin
--

CREATE SCHEMA news;


ALTER SCHEMA news OWNER TO admin;

--
-- Name: order_ci_1774020307401; Type: SCHEMA; Schema: -; Owner: admin
--

CREATE SCHEMA order_ci_1774020307401;


ALTER SCHEMA order_ci_1774020307401 OWNER TO admin;

--
-- Name: order_ci_1774020400837; Type: SCHEMA; Schema: -; Owner: admin
--

CREATE SCHEMA order_ci_1774020400837;


ALTER SCHEMA order_ci_1774020400837 OWNER TO admin;

--
-- Name: order_ci_1774020528986; Type: SCHEMA; Schema: -; Owner: admin
--

CREATE SCHEMA order_ci_1774020528986;


ALTER SCHEMA order_ci_1774020528986 OWNER TO admin;

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
-- Name: inference_logs; Type: TABLE; Schema: ai; Owner: admin
--

CREATE TABLE ai.inference_logs (
    id bigint NOT NULL,
    endpoint character varying(80) NOT NULL,
    user_id character varying(128),
    status character varying(20) NOT NULL,
    latency_ms integer,
    request_payload jsonb,
    response_payload jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ai.inference_logs OWNER TO admin;

--
-- Name: inference_logs_id_seq; Type: SEQUENCE; Schema: ai; Owner: admin
--

CREATE SEQUENCE ai.inference_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE ai.inference_logs_id_seq OWNER TO admin;

--
-- Name: inference_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: ai; Owner: admin
--

ALTER SEQUENCE ai.inference_logs_id_seq OWNED BY ai.inference_logs.id;


--
-- Name: mo_hinh_ai; Type: TABLE; Schema: ai; Owner: admin
--

CREATE TABLE ai.mo_hinh_ai (
    ma_mo_hinh bigint NOT NULL,
    ten_mo_hinh character varying(64) NOT NULL,
    phien_ban character varying(32) NOT NULL,
    da_huan_luyen boolean DEFAULT false NOT NULL,
    tong_ban_ghi integer DEFAULT 0 NOT NULL,
    tong_thuc_the integer DEFAULT 0 NOT NULL,
    thoi_diem_huan_luyen timestamp with time zone,
    chi_so jsonb DEFAULT '{}'::jsonb NOT NULL,
    ngay_tao timestamp with time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ai.mo_hinh_ai OWNER TO admin;

--
-- Name: mo_hinh_ai_ma_mo_hinh_seq; Type: SEQUENCE; Schema: ai; Owner: admin
--

CREATE SEQUENCE ai.mo_hinh_ai_ma_mo_hinh_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE ai.mo_hinh_ai_ma_mo_hinh_seq OWNER TO admin;

--
-- Name: mo_hinh_ai_ma_mo_hinh_seq; Type: SEQUENCE OWNED BY; Schema: ai; Owner: admin
--

ALTER SEQUENCE ai.mo_hinh_ai_ma_mo_hinh_seq OWNED BY ai.mo_hinh_ai.ma_mo_hinh;


--
-- Name: model_registry; Type: TABLE; Schema: ai; Owner: admin
--

CREATE TABLE ai.model_registry (
    id bigint NOT NULL,
    model_name character varying(64) NOT NULL,
    model_version character varying(32) NOT NULL,
    is_trained boolean DEFAULT false NOT NULL,
    total_records integer DEFAULT 0 NOT NULL,
    total_entities integer DEFAULT 0 NOT NULL,
    trained_at timestamp with time zone,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ai.model_registry OWNER TO admin;

--
-- Name: model_registry_id_seq; Type: SEQUENCE; Schema: ai; Owner: admin
--

CREATE SEQUENCE ai.model_registry_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE ai.model_registry_id_seq OWNER TO admin;

--
-- Name: model_registry_id_seq; Type: SEQUENCE OWNED BY; Schema: ai; Owner: admin
--

ALTER SEQUENCE ai.model_registry_id_seq OWNED BY ai.model_registry.id;


--
-- Name: nhat_ky_suy_luan; Type: TABLE; Schema: ai; Owner: admin
--

CREATE TABLE ai.nhat_ky_suy_luan (
    ma_nhat_ky bigint NOT NULL,
    diem_cuoi character varying(80) NOT NULL,
    ma_nguoi_dung character varying(128),
    trang_thai character varying(20) NOT NULL,
    do_tre_ms integer,
    du_lieu_yeu_cau jsonb,
    du_lieu_phan_hoi jsonb,
    thong_tin_loi text,
    ngay_tao timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ai.nhat_ky_suy_luan OWNER TO admin;

--
-- Name: nhat_ky_suy_luan_ma_nhat_ky_seq; Type: SEQUENCE; Schema: ai; Owner: admin
--

CREATE SEQUENCE ai.nhat_ky_suy_luan_ma_nhat_ky_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE ai.nhat_ky_suy_luan_ma_nhat_ky_seq OWNER TO admin;

--
-- Name: nhat_ky_suy_luan_ma_nhat_ky_seq; Type: SEQUENCE OWNED BY; Schema: ai; Owner: admin
--

ALTER SEQUENCE ai.nhat_ky_suy_luan_ma_nhat_ky_seq OWNED BY ai.nhat_ky_suy_luan.ma_nhat_ky;


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
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL,
    thanh_pho character varying,
    quan_huyen character varying,
    hinh_anh_url text,
    gio_mo_cua character varying,
    gio_dong_cua character varying,
    map_url text
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
    co_so_ten character varying,
    reset_password_code_hash character varying,
    reset_password_code_expires_at timestamp with time zone,
    reset_password_requested_at timestamp with time zone,
    reset_password_attempts integer DEFAULT 0 NOT NULL
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
-- Name: danh_muc; Type: TABLE; Schema: menu_ci_local; Owner: admin
--

CREATE TABLE menu_ci_local.danh_muc (
    ma_danh_muc integer NOT NULL,
    ten_danh_muc character varying NOT NULL,
    hinh_anh_icon character varying
);


ALTER TABLE menu_ci_local.danh_muc OWNER TO admin;

--
-- Name: danh_muc_ma_danh_muc_seq; Type: SEQUENCE; Schema: menu_ci_local; Owner: admin
--

CREATE SEQUENCE menu_ci_local.danh_muc_ma_danh_muc_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE menu_ci_local.danh_muc_ma_danh_muc_seq OWNER TO admin;

--
-- Name: danh_muc_ma_danh_muc_seq; Type: SEQUENCE OWNED BY; Schema: menu_ci_local; Owner: admin
--

ALTER SEQUENCE menu_ci_local.danh_muc_ma_danh_muc_seq OWNED BY menu_ci_local.danh_muc.ma_danh_muc;


--
-- Name: san_pham; Type: TABLE; Schema: menu_ci_local; Owner: admin
--

CREATE TABLE menu_ci_local.san_pham (
    ma_san_pham integer NOT NULL,
    ten_san_pham character varying NOT NULL,
    gia_ban numeric(10,2) NOT NULL,
    gia_niem_yet numeric(10,2),
    mo_ta text,
    hinh_anh_url character varying,
    trang_thai boolean DEFAULT true NOT NULL,
    la_hot boolean DEFAULT false NOT NULL,
    la_moi boolean DEFAULT false NOT NULL,
    ma_danh_muc integer
);


ALTER TABLE menu_ci_local.san_pham OWNER TO admin;

--
-- Name: san_pham_ma_san_pham_seq; Type: SEQUENCE; Schema: menu_ci_local; Owner: admin
--

CREATE SEQUENCE menu_ci_local.san_pham_ma_san_pham_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE menu_ci_local.san_pham_ma_san_pham_seq OWNER TO admin;

--
-- Name: san_pham_ma_san_pham_seq; Type: SEQUENCE OWNED BY; Schema: menu_ci_local; Owner: admin
--

ALTER SEQUENCE menu_ci_local.san_pham_ma_san_pham_seq OWNED BY menu_ci_local.san_pham.ma_san_pham;


--
-- Name: articles; Type: TABLE; Schema: news; Owner: admin
--

CREATE TABLE news.articles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    content text NOT NULL,
    image_url character varying(255),
    category character varying(50),
    author_name character varying(255),
    author_id character varying,
    views integer DEFAULT 0 NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE news.articles OWNER TO admin;

--
-- Name: ca_doi_soat; Type: TABLE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE TABLE order_ci_1774020307401.ca_doi_soat (
    ma_ca uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    co_so_ma character varying DEFAULT 'MAC_DINH_CHI'::character varying NOT NULL,
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
    trang_thai_phe_duyet character varying DEFAULT 'PENDING'::character varying NOT NULL,
    manager_duyet character varying,
    ghi_chu_phe_duyet text,
    thoi_gian_phe_duyet timestamp with time zone,
    du_lieu_tom_tat jsonb DEFAULT '{}'::jsonb NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020307401.ca_doi_soat OWNER TO admin;

--
-- Name: ca_lam_viec_nhan_vien; Type: TABLE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE TABLE order_ci_1774020307401.ca_lam_viec_nhan_vien (
    ma_ca_lam_viec uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    co_so_ma character varying DEFAULT 'MAC_DINH_CHI'::character varying NOT NULL,
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
    nguon_tao character varying DEFAULT 'MANAGER_ASSIGNMENT'::character varying NOT NULL,
    trang_thai_yeu_cau character varying DEFAULT 'APPROVED'::character varying NOT NULL,
    thoi_gian_gui_yeu_cau timestamp with time zone,
    nguoi_duyet_yeu_cau character varying,
    ghi_chu_duyet text,
    thoi_gian_duyet timestamp with time zone,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020307401.ca_lam_viec_nhan_vien OWNER TO admin;

--
-- Name: chat_conversation; Type: TABLE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE TABLE order_ci_1774020307401.chat_conversation (
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


ALTER TABLE order_ci_1774020307401.chat_conversation OWNER TO admin;

--
-- Name: chat_message; Type: TABLE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE TABLE order_ci_1774020307401.chat_message (
    id integer NOT NULL,
    ma_hoi_thoai uuid NOT NULL,
    ma_nguoi_gui character varying NOT NULL,
    ten_nguoi_gui character varying,
    vai_tro_nguoi_gui character varying NOT NULL,
    noi_dung text NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020307401.chat_message OWNER TO admin;

--
-- Name: chat_message_id_seq; Type: SEQUENCE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE SEQUENCE order_ci_1774020307401.chat_message_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020307401.chat_message_id_seq OWNER TO admin;

--
-- Name: chat_message_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020307401; Owner: admin
--

ALTER SEQUENCE order_ci_1774020307401.chat_message_id_seq OWNED BY order_ci_1774020307401.chat_message.id;


--
-- Name: chi_tiet_don_hang; Type: TABLE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE TABLE order_ci_1774020307401.chi_tiet_don_hang (
    id integer NOT NULL,
    ma_don_hang uuid NOT NULL,
    ma_san_pham integer NOT NULL,
    ten_san_pham character varying NOT NULL,
    gia_ban numeric(12,2) NOT NULL,
    so_luong integer DEFAULT 1 NOT NULL,
    kich_co character varying,
    hinh_anh_url character varying
);


ALTER TABLE order_ci_1774020307401.chi_tiet_don_hang OWNER TO admin;

--
-- Name: chi_tiet_don_hang_id_seq; Type: SEQUENCE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE SEQUENCE order_ci_1774020307401.chi_tiet_don_hang_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020307401.chi_tiet_don_hang_id_seq OWNER TO admin;

--
-- Name: chi_tiet_don_hang_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020307401; Owner: admin
--

ALTER SEQUENCE order_ci_1774020307401.chi_tiet_don_hang_id_seq OWNED BY order_ci_1774020307401.chi_tiet_don_hang.id;


--
-- Name: danh_gia_san_pham; Type: TABLE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE TABLE order_ci_1774020307401.danh_gia_san_pham (
    id integer NOT NULL,
    ma_san_pham character varying(64) NOT NULL,
    ma_nguoi_dung uuid NOT NULL,
    so_sao integer NOT NULL,
    binh_luan text,
    ma_don_hang uuid,
    phan_hoi_quan_ly text,
    nguoi_phan_hoi character varying,
    thoi_gian_phan_hoi timestamp with time zone,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020307401.danh_gia_san_pham OWNER TO admin;

--
-- Name: danh_gia_san_pham_id_seq; Type: SEQUENCE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE SEQUENCE order_ci_1774020307401.danh_gia_san_pham_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020307401.danh_gia_san_pham_id_seq OWNER TO admin;

--
-- Name: danh_gia_san_pham_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020307401; Owner: admin
--

ALTER SEQUENCE order_ci_1774020307401.danh_gia_san_pham_id_seq OWNED BY order_ci_1774020307401.danh_gia_san_pham.id;


--
-- Name: don_hang; Type: TABLE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE TABLE order_ci_1774020307401.don_hang (
    ma_don_hang uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ma_nguoi_dung character varying NOT NULL,
    co_so_ma character varying DEFAULT 'MAC_DINH_CHI'::character varying NOT NULL,
    tong_tien numeric(12,2) NOT NULL,
    dia_chi_giao_hang character varying NOT NULL,
    khung_gio_giao character varying,
    ghi_chu text,
    loai_don_hang character varying,
    ma_ban character varying,
    ten_khach_hang character varying,
    ten_thu_ngan character varying,
    phuong_thuc_thanh_toan character varying NOT NULL,
    trang_thai_thanh_toan character varying DEFAULT 'CHO_THANH_TOAN'::character varying NOT NULL,
    trang_thai_don_hang character varying DEFAULT 'MOI_TAO'::character varying NOT NULL,
    ma_voucher character varying,
    so_tien_giam numeric(12,2) DEFAULT '0'::numeric,
    tien_khach_dua numeric(12,2),
    tien_thoi numeric(12,2) DEFAULT '0'::numeric,
    lich_su_trang_thai jsonb DEFAULT '[]'::jsonb NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020307401.don_hang OWNER TO admin;

--
-- Name: giao_dich_thanh_toan; Type: TABLE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE TABLE order_ci_1774020307401.giao_dich_thanh_toan (
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


ALTER TABLE order_ci_1774020307401.giao_dich_thanh_toan OWNER TO admin;

--
-- Name: giao_dich_thanh_toan_ma_giao_dich_seq; Type: SEQUENCE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE SEQUENCE order_ci_1774020307401.giao_dich_thanh_toan_ma_giao_dich_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020307401.giao_dich_thanh_toan_ma_giao_dich_seq OWNER TO admin;

--
-- Name: giao_dich_thanh_toan_ma_giao_dich_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020307401; Owner: admin
--

ALTER SEQUENCE order_ci_1774020307401.giao_dich_thanh_toan_ma_giao_dich_seq OWNED BY order_ci_1774020307401.giao_dich_thanh_toan.ma_giao_dich;


--
-- Name: gio_hang; Type: TABLE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE TABLE order_ci_1774020307401.gio_hang (
    id integer NOT NULL,
    ma_nguoi_dung character varying NOT NULL,
    ma_san_pham integer NOT NULL,
    ten_san_pham character varying NOT NULL,
    gia_ban numeric NOT NULL,
    hinh_anh_url character varying NOT NULL,
    kich_co character varying DEFAULT 'Nhỏ'::character varying NOT NULL,
    so_luong integer DEFAULT 1 NOT NULL
);


ALTER TABLE order_ci_1774020307401.gio_hang OWNER TO admin;

--
-- Name: gio_hang_id_seq; Type: SEQUENCE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE SEQUENCE order_ci_1774020307401.gio_hang_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020307401.gio_hang_id_seq OWNER TO admin;

--
-- Name: gio_hang_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020307401; Owner: admin
--

ALTER SEQUENCE order_ci_1774020307401.gio_hang_id_seq OWNED BY order_ci_1774020307401.gio_hang.id;


--
-- Name: thong_bao; Type: TABLE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE TABLE order_ci_1774020307401.thong_bao (
    id integer NOT NULL,
    ma_nguoi_dung character varying(64) NOT NULL,
    tieu_de character varying(120) NOT NULL,
    noi_dung text NOT NULL,
    loai character varying(20) DEFAULT 'SYSTEM'::character varying NOT NULL,
    da_doc boolean DEFAULT false NOT NULL,
    du_lieu jsonb,
    ngay_tao timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020307401.thong_bao OWNER TO admin;

--
-- Name: thong_bao_id_seq; Type: SEQUENCE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE SEQUENCE order_ci_1774020307401.thong_bao_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020307401.thong_bao_id_seq OWNER TO admin;

--
-- Name: thong_bao_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020307401; Owner: admin
--

ALTER SEQUENCE order_ci_1774020307401.thong_bao_id_seq OWNED BY order_ci_1774020307401.thong_bao.id;


--
-- Name: voucher; Type: TABLE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE TABLE order_ci_1774020307401.voucher (
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


ALTER TABLE order_ci_1774020307401.voucher OWNER TO admin;

--
-- Name: voucher_id_seq; Type: SEQUENCE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE SEQUENCE order_ci_1774020307401.voucher_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020307401.voucher_id_seq OWNER TO admin;

--
-- Name: voucher_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020307401; Owner: admin
--

ALTER SEQUENCE order_ci_1774020307401.voucher_id_seq OWNED BY order_ci_1774020307401.voucher.id;


--
-- Name: yeu_thich_san_pham; Type: TABLE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE TABLE order_ci_1774020307401.yeu_thich_san_pham (
    id integer NOT NULL,
    ma_nguoi_dung character varying(64) NOT NULL,
    ma_san_pham character varying(64) NOT NULL,
    ten_san_pham character varying(255),
    gia_ban numeric,
    hinh_anh_url character varying(500),
    danh_muc character varying(120),
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020307401.yeu_thich_san_pham OWNER TO admin;

--
-- Name: yeu_thich_san_pham_id_seq; Type: SEQUENCE; Schema: order_ci_1774020307401; Owner: admin
--

CREATE SEQUENCE order_ci_1774020307401.yeu_thich_san_pham_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020307401.yeu_thich_san_pham_id_seq OWNER TO admin;

--
-- Name: yeu_thich_san_pham_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020307401; Owner: admin
--

ALTER SEQUENCE order_ci_1774020307401.yeu_thich_san_pham_id_seq OWNED BY order_ci_1774020307401.yeu_thich_san_pham.id;


--
-- Name: ca_doi_soat; Type: TABLE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE TABLE order_ci_1774020400837.ca_doi_soat (
    ma_ca uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    co_so_ma character varying DEFAULT 'MAC_DINH_CHI'::character varying NOT NULL,
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
    trang_thai_phe_duyet character varying DEFAULT 'PENDING'::character varying NOT NULL,
    manager_duyet character varying,
    ghi_chu_phe_duyet text,
    thoi_gian_phe_duyet timestamp with time zone,
    du_lieu_tom_tat jsonb DEFAULT '{}'::jsonb NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020400837.ca_doi_soat OWNER TO admin;

--
-- Name: ca_lam_viec_nhan_vien; Type: TABLE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE TABLE order_ci_1774020400837.ca_lam_viec_nhan_vien (
    ma_ca_lam_viec uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    co_so_ma character varying DEFAULT 'MAC_DINH_CHI'::character varying NOT NULL,
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
    nguon_tao character varying DEFAULT 'MANAGER_ASSIGNMENT'::character varying NOT NULL,
    trang_thai_yeu_cau character varying DEFAULT 'APPROVED'::character varying NOT NULL,
    thoi_gian_gui_yeu_cau timestamp with time zone,
    nguoi_duyet_yeu_cau character varying,
    ghi_chu_duyet text,
    thoi_gian_duyet timestamp with time zone,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020400837.ca_lam_viec_nhan_vien OWNER TO admin;

--
-- Name: chat_conversation; Type: TABLE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE TABLE order_ci_1774020400837.chat_conversation (
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


ALTER TABLE order_ci_1774020400837.chat_conversation OWNER TO admin;

--
-- Name: chat_message; Type: TABLE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE TABLE order_ci_1774020400837.chat_message (
    id integer NOT NULL,
    ma_hoi_thoai uuid NOT NULL,
    ma_nguoi_gui character varying NOT NULL,
    ten_nguoi_gui character varying,
    vai_tro_nguoi_gui character varying NOT NULL,
    noi_dung text NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020400837.chat_message OWNER TO admin;

--
-- Name: chat_message_id_seq; Type: SEQUENCE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE SEQUENCE order_ci_1774020400837.chat_message_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020400837.chat_message_id_seq OWNER TO admin;

--
-- Name: chat_message_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020400837; Owner: admin
--

ALTER SEQUENCE order_ci_1774020400837.chat_message_id_seq OWNED BY order_ci_1774020400837.chat_message.id;


--
-- Name: chi_tiet_don_hang; Type: TABLE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE TABLE order_ci_1774020400837.chi_tiet_don_hang (
    id integer NOT NULL,
    ma_don_hang uuid NOT NULL,
    ma_san_pham integer NOT NULL,
    ten_san_pham character varying NOT NULL,
    gia_ban numeric(12,2) NOT NULL,
    so_luong integer DEFAULT 1 NOT NULL,
    kich_co character varying,
    hinh_anh_url character varying
);


ALTER TABLE order_ci_1774020400837.chi_tiet_don_hang OWNER TO admin;

--
-- Name: chi_tiet_don_hang_id_seq; Type: SEQUENCE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE SEQUENCE order_ci_1774020400837.chi_tiet_don_hang_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020400837.chi_tiet_don_hang_id_seq OWNER TO admin;

--
-- Name: chi_tiet_don_hang_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020400837; Owner: admin
--

ALTER SEQUENCE order_ci_1774020400837.chi_tiet_don_hang_id_seq OWNED BY order_ci_1774020400837.chi_tiet_don_hang.id;


--
-- Name: danh_gia_san_pham; Type: TABLE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE TABLE order_ci_1774020400837.danh_gia_san_pham (
    id integer NOT NULL,
    ma_san_pham character varying(64) NOT NULL,
    ma_nguoi_dung uuid NOT NULL,
    so_sao integer NOT NULL,
    binh_luan text,
    ma_don_hang uuid,
    phan_hoi_quan_ly text,
    nguoi_phan_hoi character varying,
    thoi_gian_phan_hoi timestamp with time zone,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020400837.danh_gia_san_pham OWNER TO admin;

--
-- Name: danh_gia_san_pham_id_seq; Type: SEQUENCE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE SEQUENCE order_ci_1774020400837.danh_gia_san_pham_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020400837.danh_gia_san_pham_id_seq OWNER TO admin;

--
-- Name: danh_gia_san_pham_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020400837; Owner: admin
--

ALTER SEQUENCE order_ci_1774020400837.danh_gia_san_pham_id_seq OWNED BY order_ci_1774020400837.danh_gia_san_pham.id;


--
-- Name: don_hang; Type: TABLE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE TABLE order_ci_1774020400837.don_hang (
    ma_don_hang uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ma_nguoi_dung character varying NOT NULL,
    co_so_ma character varying DEFAULT 'MAC_DINH_CHI'::character varying NOT NULL,
    tong_tien numeric(12,2) NOT NULL,
    dia_chi_giao_hang character varying NOT NULL,
    khung_gio_giao character varying,
    ghi_chu text,
    loai_don_hang character varying,
    ma_ban character varying,
    ten_khach_hang character varying,
    ten_thu_ngan character varying,
    phuong_thuc_thanh_toan character varying NOT NULL,
    trang_thai_thanh_toan character varying DEFAULT 'CHO_THANH_TOAN'::character varying NOT NULL,
    trang_thai_don_hang character varying DEFAULT 'MOI_TAO'::character varying NOT NULL,
    ma_voucher character varying,
    so_tien_giam numeric(12,2) DEFAULT '0'::numeric,
    tien_khach_dua numeric(12,2),
    tien_thoi numeric(12,2) DEFAULT '0'::numeric,
    lich_su_trang_thai jsonb DEFAULT '[]'::jsonb NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020400837.don_hang OWNER TO admin;

--
-- Name: giao_dich_thanh_toan; Type: TABLE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE TABLE order_ci_1774020400837.giao_dich_thanh_toan (
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


ALTER TABLE order_ci_1774020400837.giao_dich_thanh_toan OWNER TO admin;

--
-- Name: giao_dich_thanh_toan_ma_giao_dich_seq; Type: SEQUENCE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE SEQUENCE order_ci_1774020400837.giao_dich_thanh_toan_ma_giao_dich_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020400837.giao_dich_thanh_toan_ma_giao_dich_seq OWNER TO admin;

--
-- Name: giao_dich_thanh_toan_ma_giao_dich_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020400837; Owner: admin
--

ALTER SEQUENCE order_ci_1774020400837.giao_dich_thanh_toan_ma_giao_dich_seq OWNED BY order_ci_1774020400837.giao_dich_thanh_toan.ma_giao_dich;


--
-- Name: gio_hang; Type: TABLE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE TABLE order_ci_1774020400837.gio_hang (
    id integer NOT NULL,
    ma_nguoi_dung character varying NOT NULL,
    ma_san_pham integer NOT NULL,
    ten_san_pham character varying NOT NULL,
    gia_ban numeric NOT NULL,
    hinh_anh_url character varying NOT NULL,
    kich_co character varying DEFAULT 'Nhỏ'::character varying NOT NULL,
    so_luong integer DEFAULT 1 NOT NULL
);


ALTER TABLE order_ci_1774020400837.gio_hang OWNER TO admin;

--
-- Name: gio_hang_id_seq; Type: SEQUENCE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE SEQUENCE order_ci_1774020400837.gio_hang_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020400837.gio_hang_id_seq OWNER TO admin;

--
-- Name: gio_hang_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020400837; Owner: admin
--

ALTER SEQUENCE order_ci_1774020400837.gio_hang_id_seq OWNED BY order_ci_1774020400837.gio_hang.id;


--
-- Name: thong_bao; Type: TABLE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE TABLE order_ci_1774020400837.thong_bao (
    id integer NOT NULL,
    ma_nguoi_dung character varying(64) NOT NULL,
    tieu_de character varying(120) NOT NULL,
    noi_dung text NOT NULL,
    loai character varying(20) DEFAULT 'SYSTEM'::character varying NOT NULL,
    da_doc boolean DEFAULT false NOT NULL,
    du_lieu jsonb,
    ngay_tao timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020400837.thong_bao OWNER TO admin;

--
-- Name: thong_bao_id_seq; Type: SEQUENCE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE SEQUENCE order_ci_1774020400837.thong_bao_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020400837.thong_bao_id_seq OWNER TO admin;

--
-- Name: thong_bao_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020400837; Owner: admin
--

ALTER SEQUENCE order_ci_1774020400837.thong_bao_id_seq OWNED BY order_ci_1774020400837.thong_bao.id;


--
-- Name: voucher; Type: TABLE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE TABLE order_ci_1774020400837.voucher (
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


ALTER TABLE order_ci_1774020400837.voucher OWNER TO admin;

--
-- Name: voucher_id_seq; Type: SEQUENCE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE SEQUENCE order_ci_1774020400837.voucher_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020400837.voucher_id_seq OWNER TO admin;

--
-- Name: voucher_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020400837; Owner: admin
--

ALTER SEQUENCE order_ci_1774020400837.voucher_id_seq OWNED BY order_ci_1774020400837.voucher.id;


--
-- Name: yeu_thich_san_pham; Type: TABLE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE TABLE order_ci_1774020400837.yeu_thich_san_pham (
    id integer NOT NULL,
    ma_nguoi_dung character varying(64) NOT NULL,
    ma_san_pham character varying(64) NOT NULL,
    ten_san_pham character varying(255),
    gia_ban numeric,
    hinh_anh_url character varying(500),
    danh_muc character varying(120),
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020400837.yeu_thich_san_pham OWNER TO admin;

--
-- Name: yeu_thich_san_pham_id_seq; Type: SEQUENCE; Schema: order_ci_1774020400837; Owner: admin
--

CREATE SEQUENCE order_ci_1774020400837.yeu_thich_san_pham_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020400837.yeu_thich_san_pham_id_seq OWNER TO admin;

--
-- Name: yeu_thich_san_pham_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020400837; Owner: admin
--

ALTER SEQUENCE order_ci_1774020400837.yeu_thich_san_pham_id_seq OWNED BY order_ci_1774020400837.yeu_thich_san_pham.id;


--
-- Name: ca_doi_soat; Type: TABLE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE TABLE order_ci_1774020528986.ca_doi_soat (
    ma_ca uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    co_so_ma character varying DEFAULT 'MAC_DINH_CHI'::character varying NOT NULL,
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
    trang_thai_phe_duyet character varying DEFAULT 'PENDING'::character varying NOT NULL,
    manager_duyet character varying,
    ghi_chu_phe_duyet text,
    thoi_gian_phe_duyet timestamp with time zone,
    du_lieu_tom_tat jsonb DEFAULT '{}'::jsonb NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020528986.ca_doi_soat OWNER TO admin;

--
-- Name: ca_lam_viec_nhan_vien; Type: TABLE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE TABLE order_ci_1774020528986.ca_lam_viec_nhan_vien (
    ma_ca_lam_viec uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    co_so_ma character varying DEFAULT 'MAC_DINH_CHI'::character varying NOT NULL,
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
    nguon_tao character varying DEFAULT 'MANAGER_ASSIGNMENT'::character varying NOT NULL,
    trang_thai_yeu_cau character varying DEFAULT 'APPROVED'::character varying NOT NULL,
    thoi_gian_gui_yeu_cau timestamp with time zone,
    nguoi_duyet_yeu_cau character varying,
    ghi_chu_duyet text,
    thoi_gian_duyet timestamp with time zone,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020528986.ca_lam_viec_nhan_vien OWNER TO admin;

--
-- Name: chat_conversation; Type: TABLE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE TABLE order_ci_1774020528986.chat_conversation (
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


ALTER TABLE order_ci_1774020528986.chat_conversation OWNER TO admin;

--
-- Name: chat_message; Type: TABLE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE TABLE order_ci_1774020528986.chat_message (
    id integer NOT NULL,
    ma_hoi_thoai uuid NOT NULL,
    ma_nguoi_gui character varying NOT NULL,
    ten_nguoi_gui character varying,
    vai_tro_nguoi_gui character varying NOT NULL,
    noi_dung text NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020528986.chat_message OWNER TO admin;

--
-- Name: chat_message_id_seq; Type: SEQUENCE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE SEQUENCE order_ci_1774020528986.chat_message_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020528986.chat_message_id_seq OWNER TO admin;

--
-- Name: chat_message_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020528986; Owner: admin
--

ALTER SEQUENCE order_ci_1774020528986.chat_message_id_seq OWNED BY order_ci_1774020528986.chat_message.id;


--
-- Name: chi_tiet_don_hang; Type: TABLE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE TABLE order_ci_1774020528986.chi_tiet_don_hang (
    id integer NOT NULL,
    ma_don_hang uuid NOT NULL,
    ma_san_pham integer NOT NULL,
    ten_san_pham character varying NOT NULL,
    gia_ban numeric(12,2) NOT NULL,
    so_luong integer DEFAULT 1 NOT NULL,
    kich_co character varying,
    hinh_anh_url character varying
);


ALTER TABLE order_ci_1774020528986.chi_tiet_don_hang OWNER TO admin;

--
-- Name: chi_tiet_don_hang_id_seq; Type: SEQUENCE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE SEQUENCE order_ci_1774020528986.chi_tiet_don_hang_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020528986.chi_tiet_don_hang_id_seq OWNER TO admin;

--
-- Name: chi_tiet_don_hang_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020528986; Owner: admin
--

ALTER SEQUENCE order_ci_1774020528986.chi_tiet_don_hang_id_seq OWNED BY order_ci_1774020528986.chi_tiet_don_hang.id;


--
-- Name: danh_gia_san_pham; Type: TABLE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE TABLE order_ci_1774020528986.danh_gia_san_pham (
    id integer NOT NULL,
    ma_san_pham character varying(64) NOT NULL,
    ma_nguoi_dung uuid NOT NULL,
    so_sao integer NOT NULL,
    binh_luan text,
    ma_don_hang uuid,
    phan_hoi_quan_ly text,
    nguoi_phan_hoi character varying,
    thoi_gian_phan_hoi timestamp with time zone,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020528986.danh_gia_san_pham OWNER TO admin;

--
-- Name: danh_gia_san_pham_id_seq; Type: SEQUENCE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE SEQUENCE order_ci_1774020528986.danh_gia_san_pham_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020528986.danh_gia_san_pham_id_seq OWNER TO admin;

--
-- Name: danh_gia_san_pham_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020528986; Owner: admin
--

ALTER SEQUENCE order_ci_1774020528986.danh_gia_san_pham_id_seq OWNED BY order_ci_1774020528986.danh_gia_san_pham.id;


--
-- Name: don_hang; Type: TABLE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE TABLE order_ci_1774020528986.don_hang (
    ma_don_hang uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ma_nguoi_dung character varying NOT NULL,
    co_so_ma character varying DEFAULT 'MAC_DINH_CHI'::character varying NOT NULL,
    tong_tien numeric(12,2) NOT NULL,
    dia_chi_giao_hang character varying NOT NULL,
    khung_gio_giao character varying,
    ghi_chu text,
    loai_don_hang character varying,
    ma_ban character varying,
    ten_khach_hang character varying,
    ten_thu_ngan character varying,
    phuong_thuc_thanh_toan character varying NOT NULL,
    trang_thai_thanh_toan character varying DEFAULT 'CHO_THANH_TOAN'::character varying NOT NULL,
    trang_thai_don_hang character varying DEFAULT 'MOI_TAO'::character varying NOT NULL,
    ma_voucher character varying,
    so_tien_giam numeric(12,2) DEFAULT '0'::numeric,
    tien_khach_dua numeric(12,2),
    tien_thoi numeric(12,2) DEFAULT '0'::numeric,
    lich_su_trang_thai jsonb DEFAULT '[]'::jsonb NOT NULL,
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL,
    ngay_cap_nhat timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020528986.don_hang OWNER TO admin;

--
-- Name: giao_dich_thanh_toan; Type: TABLE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE TABLE order_ci_1774020528986.giao_dich_thanh_toan (
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


ALTER TABLE order_ci_1774020528986.giao_dich_thanh_toan OWNER TO admin;

--
-- Name: giao_dich_thanh_toan_ma_giao_dich_seq; Type: SEQUENCE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE SEQUENCE order_ci_1774020528986.giao_dich_thanh_toan_ma_giao_dich_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020528986.giao_dich_thanh_toan_ma_giao_dich_seq OWNER TO admin;

--
-- Name: giao_dich_thanh_toan_ma_giao_dich_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020528986; Owner: admin
--

ALTER SEQUENCE order_ci_1774020528986.giao_dich_thanh_toan_ma_giao_dich_seq OWNED BY order_ci_1774020528986.giao_dich_thanh_toan.ma_giao_dich;


--
-- Name: gio_hang; Type: TABLE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE TABLE order_ci_1774020528986.gio_hang (
    id integer NOT NULL,
    ma_nguoi_dung character varying NOT NULL,
    ma_san_pham integer NOT NULL,
    ten_san_pham character varying NOT NULL,
    gia_ban numeric NOT NULL,
    hinh_anh_url character varying NOT NULL,
    kich_co character varying DEFAULT 'Nhỏ'::character varying NOT NULL,
    so_luong integer DEFAULT 1 NOT NULL
);


ALTER TABLE order_ci_1774020528986.gio_hang OWNER TO admin;

--
-- Name: gio_hang_id_seq; Type: SEQUENCE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE SEQUENCE order_ci_1774020528986.gio_hang_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020528986.gio_hang_id_seq OWNER TO admin;

--
-- Name: gio_hang_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020528986; Owner: admin
--

ALTER SEQUENCE order_ci_1774020528986.gio_hang_id_seq OWNED BY order_ci_1774020528986.gio_hang.id;


--
-- Name: thong_bao; Type: TABLE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE TABLE order_ci_1774020528986.thong_bao (
    id integer NOT NULL,
    ma_nguoi_dung character varying(64) NOT NULL,
    tieu_de character varying(120) NOT NULL,
    noi_dung text NOT NULL,
    loai character varying(20) DEFAULT 'SYSTEM'::character varying NOT NULL,
    da_doc boolean DEFAULT false NOT NULL,
    du_lieu jsonb,
    ngay_tao timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020528986.thong_bao OWNER TO admin;

--
-- Name: thong_bao_id_seq; Type: SEQUENCE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE SEQUENCE order_ci_1774020528986.thong_bao_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020528986.thong_bao_id_seq OWNER TO admin;

--
-- Name: thong_bao_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020528986; Owner: admin
--

ALTER SEQUENCE order_ci_1774020528986.thong_bao_id_seq OWNED BY order_ci_1774020528986.thong_bao.id;


--
-- Name: voucher; Type: TABLE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE TABLE order_ci_1774020528986.voucher (
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


ALTER TABLE order_ci_1774020528986.voucher OWNER TO admin;

--
-- Name: voucher_id_seq; Type: SEQUENCE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE SEQUENCE order_ci_1774020528986.voucher_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020528986.voucher_id_seq OWNER TO admin;

--
-- Name: voucher_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020528986; Owner: admin
--

ALTER SEQUENCE order_ci_1774020528986.voucher_id_seq OWNED BY order_ci_1774020528986.voucher.id;


--
-- Name: yeu_thich_san_pham; Type: TABLE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE TABLE order_ci_1774020528986.yeu_thich_san_pham (
    id integer NOT NULL,
    ma_nguoi_dung character varying(64) NOT NULL,
    ma_san_pham character varying(64) NOT NULL,
    ten_san_pham character varying(255),
    gia_ban numeric,
    hinh_anh_url character varying(500),
    danh_muc character varying(120),
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE order_ci_1774020528986.yeu_thich_san_pham OWNER TO admin;

--
-- Name: yeu_thich_san_pham_id_seq; Type: SEQUENCE; Schema: order_ci_1774020528986; Owner: admin
--

CREATE SEQUENCE order_ci_1774020528986.yeu_thich_san_pham_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE order_ci_1774020528986.yeu_thich_san_pham_id_seq OWNER TO admin;

--
-- Name: yeu_thich_san_pham_id_seq; Type: SEQUENCE OWNED BY; Schema: order_ci_1774020528986; Owner: admin
--

ALTER SEQUENCE order_ci_1774020528986.yeu_thich_san_pham_id_seq OWNED BY order_ci_1774020528986.yeu_thich_san_pham.id;


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
-- Name: yeu_thich_san_pham; Type: TABLE; Schema: orders; Owner: admin
--

CREATE TABLE orders.yeu_thich_san_pham (
    id integer NOT NULL,
    ma_nguoi_dung character varying(64) NOT NULL,
    ma_san_pham character varying(64) NOT NULL,
    ten_san_pham character varying(255),
    gia_ban numeric,
    hinh_anh_url character varying(500),
    danh_muc character varying(120),
    ngay_tao timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE orders.yeu_thich_san_pham OWNER TO admin;

--
-- Name: yeu_thich_san_pham_id_seq; Type: SEQUENCE; Schema: orders; Owner: admin
--

CREATE SEQUENCE orders.yeu_thich_san_pham_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE orders.yeu_thich_san_pham_id_seq OWNER TO admin;

--
-- Name: yeu_thich_san_pham_id_seq; Type: SEQUENCE OWNED BY; Schema: orders; Owner: admin
--

ALTER SEQUENCE orders.yeu_thich_san_pham_id_seq OWNED BY orders.yeu_thich_san_pham.id;


--
-- Name: inference_logs id; Type: DEFAULT; Schema: ai; Owner: admin
--

ALTER TABLE ONLY ai.inference_logs ALTER COLUMN id SET DEFAULT nextval('ai.inference_logs_id_seq'::regclass);


--
-- Name: mo_hinh_ai ma_mo_hinh; Type: DEFAULT; Schema: ai; Owner: admin
--

ALTER TABLE ONLY ai.mo_hinh_ai ALTER COLUMN ma_mo_hinh SET DEFAULT nextval('ai.mo_hinh_ai_ma_mo_hinh_seq'::regclass);


--
-- Name: model_registry id; Type: DEFAULT; Schema: ai; Owner: admin
--

ALTER TABLE ONLY ai.model_registry ALTER COLUMN id SET DEFAULT nextval('ai.model_registry_id_seq'::regclass);


--
-- Name: nhat_ky_suy_luan ma_nhat_ky; Type: DEFAULT; Schema: ai; Owner: admin
--

ALTER TABLE ONLY ai.nhat_ky_suy_luan ALTER COLUMN ma_nhat_ky SET DEFAULT nextval('ai.nhat_ky_suy_luan_ma_nhat_ky_seq'::regclass);


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
-- Name: danh_muc ma_danh_muc; Type: DEFAULT; Schema: menu_ci_local; Owner: admin
--

ALTER TABLE ONLY menu_ci_local.danh_muc ALTER COLUMN ma_danh_muc SET DEFAULT nextval('menu_ci_local.danh_muc_ma_danh_muc_seq'::regclass);


--
-- Name: san_pham ma_san_pham; Type: DEFAULT; Schema: menu_ci_local; Owner: admin
--

ALTER TABLE ONLY menu_ci_local.san_pham ALTER COLUMN ma_san_pham SET DEFAULT nextval('menu_ci_local.san_pham_ma_san_pham_seq'::regclass);


--
-- Name: chat_message id; Type: DEFAULT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.chat_message ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020307401.chat_message_id_seq'::regclass);


--
-- Name: chi_tiet_don_hang id; Type: DEFAULT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.chi_tiet_don_hang ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020307401.chi_tiet_don_hang_id_seq'::regclass);


--
-- Name: danh_gia_san_pham id; Type: DEFAULT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.danh_gia_san_pham ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020307401.danh_gia_san_pham_id_seq'::regclass);


--
-- Name: giao_dich_thanh_toan ma_giao_dich; Type: DEFAULT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.giao_dich_thanh_toan ALTER COLUMN ma_giao_dich SET DEFAULT nextval('order_ci_1774020307401.giao_dich_thanh_toan_ma_giao_dich_seq'::regclass);


--
-- Name: gio_hang id; Type: DEFAULT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.gio_hang ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020307401.gio_hang_id_seq'::regclass);


--
-- Name: thong_bao id; Type: DEFAULT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.thong_bao ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020307401.thong_bao_id_seq'::regclass);


--
-- Name: voucher id; Type: DEFAULT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.voucher ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020307401.voucher_id_seq'::regclass);


--
-- Name: yeu_thich_san_pham id; Type: DEFAULT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.yeu_thich_san_pham ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020307401.yeu_thich_san_pham_id_seq'::regclass);


--
-- Name: chat_message id; Type: DEFAULT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.chat_message ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020400837.chat_message_id_seq'::regclass);


--
-- Name: chi_tiet_don_hang id; Type: DEFAULT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.chi_tiet_don_hang ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020400837.chi_tiet_don_hang_id_seq'::regclass);


--
-- Name: danh_gia_san_pham id; Type: DEFAULT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.danh_gia_san_pham ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020400837.danh_gia_san_pham_id_seq'::regclass);


--
-- Name: giao_dich_thanh_toan ma_giao_dich; Type: DEFAULT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.giao_dich_thanh_toan ALTER COLUMN ma_giao_dich SET DEFAULT nextval('order_ci_1774020400837.giao_dich_thanh_toan_ma_giao_dich_seq'::regclass);


--
-- Name: gio_hang id; Type: DEFAULT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.gio_hang ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020400837.gio_hang_id_seq'::regclass);


--
-- Name: thong_bao id; Type: DEFAULT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.thong_bao ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020400837.thong_bao_id_seq'::regclass);


--
-- Name: voucher id; Type: DEFAULT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.voucher ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020400837.voucher_id_seq'::regclass);


--
-- Name: yeu_thich_san_pham id; Type: DEFAULT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.yeu_thich_san_pham ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020400837.yeu_thich_san_pham_id_seq'::regclass);


--
-- Name: chat_message id; Type: DEFAULT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.chat_message ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020528986.chat_message_id_seq'::regclass);


--
-- Name: chi_tiet_don_hang id; Type: DEFAULT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.chi_tiet_don_hang ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020528986.chi_tiet_don_hang_id_seq'::regclass);


--
-- Name: danh_gia_san_pham id; Type: DEFAULT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.danh_gia_san_pham ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020528986.danh_gia_san_pham_id_seq'::regclass);


--
-- Name: giao_dich_thanh_toan ma_giao_dich; Type: DEFAULT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.giao_dich_thanh_toan ALTER COLUMN ma_giao_dich SET DEFAULT nextval('order_ci_1774020528986.giao_dich_thanh_toan_ma_giao_dich_seq'::regclass);


--
-- Name: gio_hang id; Type: DEFAULT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.gio_hang ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020528986.gio_hang_id_seq'::regclass);


--
-- Name: thong_bao id; Type: DEFAULT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.thong_bao ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020528986.thong_bao_id_seq'::regclass);


--
-- Name: voucher id; Type: DEFAULT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.voucher ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020528986.voucher_id_seq'::regclass);


--
-- Name: yeu_thich_san_pham id; Type: DEFAULT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.yeu_thich_san_pham ALTER COLUMN id SET DEFAULT nextval('order_ci_1774020528986.yeu_thich_san_pham_id_seq'::regclass);


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
-- Name: yeu_thich_san_pham id; Type: DEFAULT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.yeu_thich_san_pham ALTER COLUMN id SET DEFAULT nextval('orders.yeu_thich_san_pham_id_seq'::regclass);


--
-- Data for Name: inference_logs; Type: TABLE DATA; Schema: ai; Owner: admin
--

INSERT INTO ai.inference_logs (id, endpoint, user_id, status, latency_ms, request_payload, response_payload, error_message, created_at) VALUES (1, '/ai/recommend/{user_id}', 'test-user', 'success', 0, '{"limit": 2}', '{"count": 2, "is_personalized": false}', NULL, '2026-03-20 09:22:06.221626+00');
INSERT INTO ai.inference_logs (id, endpoint, user_id, status, latency_ms, request_payload, response_payload, error_message, created_at) VALUES (2, '/ai/forecast/combined', NULL, 'success', 10, '{"metric": "orders", "branch_code": "all", "history_days": 7, "forecast_days": 3}', '{"engine": "Holt-Winters (NumPy)", "history_points": 0, "forecast_points": 0}', NULL, '2026-03-20 09:22:06.410579+00');
INSERT INTO ai.inference_logs (id, endpoint, user_id, status, latency_ms, request_payload, response_payload, error_message, created_at) VALUES (3, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 197, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 09:24:25.941947+00');
INSERT INTO ai.inference_logs (id, endpoint, user_id, status, latency_ms, request_payload, response_payload, error_message, created_at) VALUES (4, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 09:24:31.755189+00');
INSERT INTO ai.inference_logs (id, endpoint, user_id, status, latency_ms, request_payload, response_payload, error_message, created_at) VALUES (5, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 09:24:31.785614+00');
INSERT INTO ai.inference_logs (id, endpoint, user_id, status, latency_ms, request_payload, response_payload, error_message, created_at) VALUES (6, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 09:26:02.699935+00');
INSERT INTO ai.inference_logs (id, endpoint, user_id, status, latency_ms, request_payload, response_payload, error_message, created_at) VALUES (7, '/ai/forecast/combined', NULL, 'success', 14, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 6, "forecast_points": 14}', NULL, '2026-03-20 09:26:30.125639+00');
INSERT INTO ai.inference_logs (id, endpoint, user_id, status, latency_ms, request_payload, response_payload, error_message, created_at) VALUES (8, '/ai/forecast/combined', NULL, 'success', 7, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 6, "forecast_points": 14}', NULL, '2026-03-20 09:26:31.113752+00');
INSERT INTO ai.inference_logs (id, endpoint, user_id, status, latency_ms, request_payload, response_payload, error_message, created_at) VALUES (9, '/ai/forecast/combined', NULL, 'success', 38, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 6, "forecast_points": 14}', NULL, '2026-03-20 09:27:12.102359+00');


--
-- Data for Name: mo_hinh_ai; Type: TABLE DATA; Schema: ai; Owner: admin
--

INSERT INTO ai.mo_hinh_ai (ma_mo_hinh, ten_mo_hinh, phien_ban, da_huan_luyen, tong_ban_ghi, tong_thuc_the, thoi_diem_huan_luyen, chi_so, ngay_tao, ngay_cap_nhat) VALUES (1, 'goi_y_ca_nhan_hoa', 'v1', true, 6, 2, '2026-03-21 06:44:12.268509+00', '{"total_items": 4}', '2026-03-20 09:36:53.259016+00', '2026-03-21 06:44:12.27412+00');
INSERT INTO ai.mo_hinh_ai (ma_mo_hinh, ten_mo_hinh, phien_ban, da_huan_luyen, tong_ban_ghi, tong_thuc_the, thoi_diem_huan_luyen, chi_so, ngay_tao, ngay_cap_nhat) VALUES (2, 'du_bao_nhu_cau', 'v1', true, 11, 2, '2026-03-21 06:35:48.060765+00', '{"engine": "Holt-Winters (NumPy)", "models_count": 6}', '2026-03-20 09:36:53.266487+00', '2026-03-21 06:44:12.277529+00');


--
-- Data for Name: model_registry; Type: TABLE DATA; Schema: ai; Owner: admin
--

INSERT INTO ai.model_registry (id, model_name, model_version, is_trained, total_records, total_entities, trained_at, metrics, created_at, updated_at) VALUES (1, 'collaborative_filtering', 'v1', true, 6, 2, '2026-03-20 09:26:27.541793+00', '{"total_items": 4}', '2026-03-20 09:21:19.045971+00', '2026-03-20 09:26:27.731198+00');
INSERT INTO ai.model_registry (id, model_name, model_version, is_trained, total_records, total_entities, trained_at, metrics, created_at, updated_at) VALUES (2, 'demand_forecasting', 'v1', true, 9, 2, '2026-03-20 09:26:27.726183+00', '{"engine": "Holt-Winters (NumPy)", "models_count": 6}', '2026-03-20 09:21:19.065885+00', '2026-03-20 09:26:27.734573+00');


--
-- Data for Name: nhat_ky_suy_luan; Type: TABLE DATA; Schema: ai; Owner: admin
--

INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (1, '/ai/recommend/{user_id}', 'test-user', 'success', 0, '{"limit": 2}', '{"count": 2, "is_personalized": false}', NULL, '2026-03-20 09:38:27.447187+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (2, '/ai/forecast/combined', NULL, 'success', 666, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 6, "forecast_points": 14}', NULL, '2026-03-20 09:41:11.429429+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (3, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 09:42:11.7962+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (4, '/ai/recommend/{user_id}', 'guest-popular', 'success', 11, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 09:42:41.935486+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (5, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 09:43:12.065709+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (6, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 09:43:42.110971+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (7, '/ai/recommend/{user_id}', 'guest-popular', 'success', 2, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 09:44:12.152663+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (8, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 09:44:42.180254+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (9, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 09:45:12.208395+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (10, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 09:45:42.285846+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (11, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 09:46:12.342567+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (12, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 09:46:42.384142+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (13, '/ai/recommend/{user_id}', 'guest-popular', 'success', 118, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 09:47:12.723795+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (14, '/ai/forecast/combined', NULL, 'success', 310, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 6, "forecast_points": 14}', NULL, '2026-03-20 10:00:09.574019+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (15, '/ai/recommend/{user_id}', 'guest-popular', 'success', 49, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 10:19:29.049196+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (16, '/ai/recommend/{user_id}', 'guest-popular', 'success', 13, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 10:19:59.583805+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (17, '/ai/forecast/combined', NULL, 'success', 431, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 6, "forecast_points": 14}', NULL, '2026-03-20 10:23:26.205008+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (18, '/ai/forecast/combined', NULL, 'success', 4, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 6, "forecast_points": 14}', NULL, '2026-03-20 10:23:46.265049+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (19, '/ai/recommend/{user_id}', 'guest-popular', 'success', 23, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 10:25:01.321238+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (20, '/ai/recommend/{user_id}', 'guest-popular', 'success', 6, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 10:25:32.406074+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (21, '/ai/recommend/{user_id}', 'guest-popular', 'success', 103, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 11:18:27.935939+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (22, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 11:19:29.094931+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (23, '/ai/forecast/combined', NULL, 'success', 258, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 6, "forecast_points": 14}', NULL, '2026-03-20 11:20:12.495291+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (24, '/ai/recommend/{user_id}', 'guest-popular', 'success', 2, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 11:20:59.194239+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (25, '/ai/forecast/combined', NULL, 'success', 1647, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 6, "forecast_points": 14}', NULL, '2026-03-20 11:23:39.172083+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (26, '/ai/recommend/{user_id}', 'guest-popular', 'success', 145, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 11:24:01.190408+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (27, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 11:24:31.808017+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (28, '/ai/recommend/{user_id}', '4fb38930-7083-4f80-b3c0-f101660b2da0', 'success', 14, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 11:24:45.668691+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (29, '/ai/forecast/combined', NULL, 'success', 1300, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 6, "forecast_points": 14}', NULL, '2026-03-20 11:28:26.683566+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (30, '/ai/recommend/{user_id}', '4fb38930-7083-4f80-b3c0-f101660b2da0', 'success', 68, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 11:33:39.73126+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (31, '/ai/recommend/{user_id}', '4fb38930-7083-4f80-b3c0-f101660b2da0', 'success', 615, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 12:07:03.184275+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (32, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 12:07:07.773496+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (33, '/ai/recommend/{user_id}', '4fb38930-7083-4f80-b3c0-f101660b2da0', 'success', 47, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 12:07:08.722348+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (34, '/ai/recommend/{user_id}', '4fb38930-7083-4f80-b3c0-f101660b2da0', 'success', 44, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 12:13:50.518509+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (35, '/ai/recommend/{user_id}', 'guest-popular', 'success', 3, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 12:13:54.593327+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (36, '/ai/recommend/{user_id}', '4fb38930-7083-4f80-b3c0-f101660b2da0', 'success', 2, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 12:13:55.497283+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (37, '/ai/recommend/{user_id}', '4fb38930-7083-4f80-b3c0-f101660b2da0', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 12:14:25.57869+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (38, '/ai/recommend/{user_id}', '4fb38930-7083-4f80-b3c0-f101660b2da0', 'success', 12, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 12:14:55.655645+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (39, '/ai/recommend/{user_id}', '4fb38930-7083-4f80-b3c0-f101660b2da0', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 12:15:25.710327+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (40, '/ai/recommend/{user_id}', '4fb38930-7083-4f80-b3c0-f101660b2da0', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 12:15:55.776863+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (41, '/ai/recommend/{user_id}', '4fb38930-7083-4f80-b3c0-f101660b2da0', 'success', 4, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 12:16:25.829342+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (42, '/ai/recommend/{user_id}', 'guest-popular', 'success', 92, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 13:15:57.705487+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (43, '/ai/recommend/{user_id}', '4fb38930-7083-4f80-b3c0-f101660b2da0', 'success', 11, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 13:15:57.853267+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (75, '/ai/recommend/{user_id}', 'guest-popular', 'success', 76, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 13:26:29.015039+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (76, '/ai/recommend/{user_id}', '4fb38930-7083-4f80-b3c0-f101660b2da0', 'success', 2, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 13:26:30.650619+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (77, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 65, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 13:26:52.170138+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (78, '/ai/recommend/{user_id}', 'guest-popular', 'success', 126, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 13:39:42.084181+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (79, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 80, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 13:39:42.084606+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (80, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 13:40:13.942233+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (81, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 114, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 13:48:08.91745+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (82, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 13:48:48.40473+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (83, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 13:48:49.611432+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (84, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 3, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 13:49:50.475679+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (85, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 13:50:20.561627+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (86, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 6, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 13:50:50.632384+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (87, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 58, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 13:55:57.12148+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (88, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 282, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 14:01:50.452306+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (89, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 607, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 14:03:52.115565+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (90, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 84, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 15:43:26.300799+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (91, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 141, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 15:52:03.496687+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (92, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 83, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 15:54:33.965075+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (93, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1290, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 16:00:05.20982+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (95, '/ai/recommend/{user_id}', 'guest-popular', 'success', 783, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 16:03:35.953873+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (94, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 547, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 16:03:35.954697+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (96, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 2, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 16:04:06.165366+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (97, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 38, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 16:06:06.424169+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (98, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 455, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 16:09:52.000984+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (99, '/ai/recommend/{user_id}', 'guest-popular', 'success', 114, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 16:14:47.380514+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (100, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 378, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 16:14:48.555449+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (101, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 103, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 16:16:19.85829+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (102, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 16:16:49.973122+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (103, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 56, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 16:18:20.270761+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (104, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 16:18:50.368442+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (105, '/ai/forecast/combined', NULL, 'success', 433, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 6, "forecast_points": 14}', NULL, '2026-03-20 16:19:31.191404+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (106, '/ai/recommend/{user_id}', 'guest-popular', 'success', 64, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 16:20:17.322038+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (107, '/ai/recommend/{user_id}', 'guest-popular', 'success', 20, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 16:21:47.998568+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (108, '/ai/recommend/{user_id}', 'guest-popular', 'success', 249, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 16:22:21.76504+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (109, '/ai/recommend/{user_id}', 'guest-popular', 'success', 80, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 16:23:52.616087+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (110, '/ai/recommend/{user_id}', 'guest-popular', 'success', 22, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 16:23:58.571322+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (111, '/ai/recommend/{user_id}', 'guest-popular', 'success', 336, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 16:24:35.734655+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (112, '/ai/recommend/{user_id}', 'guest-popular', 'success', 146, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 16:25:25.376759+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (113, '/ai/recommend/{user_id}', 'guest-popular', 'success', 93, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 16:26:35.32357+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (114, '/ai/recommend/{user_id}', 'guest-popular', 'success', 6, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 16:27:05.73145+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (115, '/ai/recommend/{user_id}', 'guest-popular', 'success', 96, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 16:28:36.145342+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (116, '/ai/recommend/{user_id}', 'guest-popular', 'success', 665, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 16:34:28.439496+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (117, '/ai/recommend/{user_id}', 'guest-popular', 'success', 164, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 16:49:49.089297+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (118, '/ai/recommend/{user_id}', 'guest-popular', 'success', 18, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 16:49:53.889153+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (119, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1942, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 17:25:56.160353+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (120, '/ai/recommend/{user_id}', 'guest-popular', 'success', 10072, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 17:25:56.167871+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (152, '/ai/recommend/{user_id}', 'guest-popular', 'success', 3, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 17:32:06.0739+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (153, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 17:32:40.283363+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (154, '/ai/recommend/{user_id}', 'guest-popular', 'success', 57, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 17:46:18.847165+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (155, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 17:46:24.606271+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (156, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 17:46:56.989678+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (157, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 17:47:27.06644+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (158, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 17:47:57.109342+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (159, '/ai/recommend/{user_id}', 'guest-popular', 'success', 26, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 17:50:27.259738+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (160, '/ai/recommend/{user_id}', 'guest-popular', 'success', 2, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 17:52:27.628331+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (161, '/ai/recommend/{user_id}', 'guest-popular', 'success', 2, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 17:53:00.932457+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (162, '/ai/recommend/{user_id}', 'guest-popular', 'success', 2, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 17:53:33.047738+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (163, '/ai/recommend/{user_id}', 'fc1f03da-710a-469d-bdcd-02ec0615c45f', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 17:53:33.069116+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (164, '/ai/recommend/{user_id}', 'guest-popular', 'success', 4, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 17:54:07.998405+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (165, '/ai/recommend/{user_id}', 'c825f533-d7ca-41a4-a56c-13979fed19df', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 17:54:08.149115+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (166, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 39, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 17:55:59.271586+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (167, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 17:57:39.579379+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (168, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 5, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 17:58:39.674358+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (169, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 17:58:40.469775+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (170, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 2, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 17:59:27.463744+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (171, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 17:59:30.480559+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (172, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:01:30.527498+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (173, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:01:32.626299+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (174, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:03:22.209248+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (175, '/ai/chat', 'guest-chat-1774027924296-14741fd9', 'success', 4766, '{"has_reply_to": false, "content_preview": "chào AI nhé"}', '{"reply_length": 352, "reply_preview": "Chào bạn! Rất vui được hỗ trợ bạn tại Avengers Coffee.\n\nHiện tại hệ thống đang có món mới là cà phê **hihi** (39.000 VND) và **Pizza Tomyum Hải Sản** (59.000 VND) rất đáng để trải nghiệm. Đặc biệt, bạn có thể sử dụng mã "}', NULL, '2026-03-20 18:03:51.505511+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (176, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:03:53.353926+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (177, '/ai/recommend/{user_id}', 'guest-popular', 'success', 96, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:09:29.461985+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (178, '/ai/recommend/{user_id}', 'guest-popular', 'success', 2, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:09:38.178337+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (179, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:10:10.037623+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (180, '/ai/recommend/{user_id}', '2a86b88c-9ab5-4801-93b2-65953835f1b8', 'success', 26, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:10:11.707514+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (181, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 26, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:11:00.165884+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (182, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:11:25.262721+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (183, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:11:56.145208+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (184, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 3, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:11:56.256596+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (185, '/ai/recommend/{user_id}', 'guest-popular', 'success', 17, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:12:02.664097+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (186, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:12:03.63869+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (187, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:12:33.736409+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (188, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 2, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:13:15.944416+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (189, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:13:24.155659+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (190, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:13:50.765624+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (191, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:14:20.803983+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (192, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:15:20.855366+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (193, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:15:40.363518+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (194, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 2, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:15:41.004361+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (195, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:15:56.47054+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (196, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:15:57.029963+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (197, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:16:27.495576+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (198, '/ai/recommend/{user_id}', 'guest-popular', 'success', 90, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:28:07.589694+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (199, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 168, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:28:10.754937+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (200, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:29:08.611934+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (201, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:29:14.758168+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (202, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:29:15.424424+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (203, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:29:20.934862+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (204, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 2, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:29:21.608675+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (205, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:29:21.951417+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (206, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:29:24.16982+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (207, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:29:24.594951+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (208, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:29:25.221465+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (209, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 32, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:31:25.380702+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (210, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:31:55.434904+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (211, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:32:25.481443+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (212, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:32:55.538229+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (213, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 180, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:33:25.830569+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (214, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 61, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:35:56.20931+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (215, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:36:26.291069+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (216, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 30, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:37:56.463605+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (217, '/ai/recommend/{user_id}', 'guest-popular', 'success', 3, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:38:44.047761+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (218, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 17, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:38:44.807701+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (219, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:41:15.814578+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (220, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 4, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:41:45.862593+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (221, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 7, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:49:02.224181+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (222, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:50:03.4869+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (223, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 27, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:50:04.269993+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (224, '/ai/recommend/{user_id}', 'guest-popular', 'success', 24, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:51:53.212031+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (225, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 7, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:51:53.751849+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (226, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:52:09.576694+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (227, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:52:10.584046+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (228, '/ai/recommend/{user_id}', 'guest-popular', 'success', 79, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:52:56.302212+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (229, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:52:57.237896+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (230, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 18:53:21.186964+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (231, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 4, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 18:53:22.223415+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (232, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 274, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 19:37:54.611084+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (233, '/ai/recommend/{user_id}', 'guest-popular', 'success', 53, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 21:05:42.850643+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (234, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 37, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 21:05:43.908566+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (235, '/ai/recommend/{user_id}', 'guest-popular', 'success', 10, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 21:05:57.694912+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (236, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 21:05:58.582+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (237, '/ai/recommend/{user_id}', 'guest-popular', 'success', 69, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 21:25:26.377694+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (238, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 46, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 21:25:27.146933+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (239, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 21:25:36.403708+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (240, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 14, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 21:25:37.651907+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (241, '/ai/forecast/combined', NULL, 'success', 1386, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 7, "forecast_points": 14}', NULL, '2026-03-20 21:53:18.224878+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (242, '/ai/forecast/combined', NULL, 'success', 74, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 7, "forecast_points": 14}', NULL, '2026-03-20 21:53:39.135803+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (243, '/ai/forecast/combined', NULL, 'success', 12, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 7, "forecast_points": 14}', NULL, '2026-03-20 21:57:48.443688+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (244, '/ai/recommend/{user_id}', 'guest-popular', 'success', 28, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 22:04:57.835751+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (245, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 53, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 22:04:59.353028+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (246, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 22:07:10.298285+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (247, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 22:07:11.23234+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (248, '/ai/forecast/combined', NULL, 'success', 169, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 7, "forecast_points": 14}', NULL, '2026-03-20 22:08:04.965172+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (249, '/ai/forecast/combined', NULL, 'success', 12, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 7, "forecast_points": 14}', NULL, '2026-03-20 22:10:45.78923+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (250, '/ai/forecast/combined', NULL, 'success', 3, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 7, "forecast_points": 14}', NULL, '2026-03-20 22:11:05.866403+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (251, '/ai/forecast/combined', NULL, 'success', 1706, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 7, "forecast_points": 14}', NULL, '2026-03-20 22:18:40.327882+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (252, '/ai/forecast/combined', NULL, 'success', 11, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 7, "forecast_points": 14}', NULL, '2026-03-20 22:19:31.597742+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (253, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 64, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 22:25:00.143463+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (254, '/ai/recommend/{user_id}', 'guest-popular', 'success', 63, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-20 22:47:25.273215+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (255, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 26, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-20 22:47:26.266386+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (256, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:35:50.944305+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (257, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-21 06:35:52.273762+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (258, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:39:08.799211+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (259, '/ai/recommend/{user_id}', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:39:56.596697+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (260, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:41:24.94054+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (261, '/ai/chat', 'guest-chat-1774074944221-732f8d19', 'success', 20043, '{"has_reply_to": false, "content_preview": "chào bạn web bạn bán gì vậy"}', '{"reply_length": 571, "reply_preview": "Chào bạn! Avengers Coffee chuyên cung cấp các loại Cà phê, Trà, Pizza và Salad đa dạng.\n\nMột số sản phẩm nổi bật bạn có thể thử:\n- **Cà phê & Trà:** Cà Phê Sữa Đá (bán chạy nhất), Trà Đào Cam Sả, hoặc món mới \"hihi\" (39."}', NULL, '2026-03-21 06:42:24.460199+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (262, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:42:24.486878+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (263, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 23, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-21 06:43:09.107904+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (264, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-21 06:44:07.433923+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (265, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-21 06:44:08.250113+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (266, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-21 06:44:08.531216+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (267, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-21 06:44:10.888416+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (268, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-21 06:44:11.356746+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (269, '/ai/recommend/{user_id}', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": true}', NULL, '2026-03-21 06:44:12.217808+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (270, '/ai/recommend/{user_id}', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:45:17.590616+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (271, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:46:05.320252+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (272, '/ai/recommend/{user_id}', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:46:06.388899+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (273, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:46:35.995519+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (274, '/ai/recommend/{user_id}', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'success', 2, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:46:36.612909+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (275, '/ai/recommend/{user_id}', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:48:37.075581+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (276, '/ai/recommend/{user_id}', 'guest-popular', 'success', 10, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:51:51.147713+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (277, '/ai/recommend/{user_id}', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:51:51.821198+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (278, '/ai/recommend/{user_id}', 'guest-popular', 'success', 28, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:52:40.156674+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (279, '/ai/recommend/{user_id}', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:52:40.68763+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (280, '/ai/recommend/{user_id}', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:54:41.69091+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (281, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:55:19.893848+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (282, '/ai/recommend/{user_id}', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:55:20.662439+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (283, '/ai/recommend/{user_id}', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 06:57:21.319418+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (284, '/ai/recommend/{user_id}', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'success', 6, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:02:37.99205+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (285, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:03:01.297002+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (286, '/ai/recommend/{user_id}', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:03:02.262043+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (287, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:03:12.971811+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (288, '/ai/recommend/{user_id}', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'success', 5, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:03:13.130123+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (289, '/ai/recommend/{user_id}', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:09:32.99344+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (290, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:09:55.456606+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (291, '/ai/recommend/{user_id}', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:09:56.6114+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (292, '/ai/recommend/{user_id}', 'guest-popular', 'success', 4, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:10:04.898761+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (293, '/ai/recommend/{user_id}', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'success', 3, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:10:05.680898+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (294, '/ai/recommend/{user_id}', 'f8535c0c-4f47-483e-b7b3-f63c563af1cc', 'success', 2, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:11:15.760002+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (295, '/ai/recommend/{user_id}', 'guest-popular', 'success', 2, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:14:41.857613+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (296, '/ai/recommend/{user_id}', 'f8535c0c-4f47-483e-b7b3-f63c563af1cc', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:14:42.595132+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (297, '/ai/recommend/{user_id}', 'guest-popular', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:14:53.356591+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (298, '/ai/recommend/{user_id}', 'f8535c0c-4f47-483e-b7b3-f63c563af1cc', 'success', 9, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:14:54.569569+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (299, '/ai/recommend/{user_id}', 'guest-popular', 'success', 4, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:17:52.633705+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (300, '/ai/recommend/{user_id}', 'f8535c0c-4f47-483e-b7b3-f63c563af1cc', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:17:53.241048+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (301, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:18:09.668257+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (302, '/ai/recommend/{user_id}', 'f8535c0c-4f47-483e-b7b3-f63c563af1cc', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:18:10.622043+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (303, '/ai/recommend/{user_id}', 'f8535c0c-4f47-483e-b7b3-f63c563af1cc', 'success', 1, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:20:10.681675+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (304, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:20:13.418848+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (305, '/ai/recommend/{user_id}', 'f8535c0c-4f47-483e-b7b3-f63c563af1cc', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:20:14.39534+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (306, '/ai/forecast/combined', NULL, 'success', 260, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 7, "forecast_points": 14}', NULL, '2026-03-21 07:20:25.501857+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (307, '/ai/forecast/combined', NULL, 'success', 2, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 7, "forecast_points": 14}', NULL, '2026-03-21 07:20:45.56534+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (308, '/ai/forecast/combined', NULL, 'success', 4, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 7, "forecast_points": 14}', NULL, '2026-03-21 07:22:12.441184+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (309, '/ai/forecast/combined', NULL, 'success', 10, '{"metric": "orders", "branch_code": "ALL", "history_days": 30, "forecast_days": 14}', '{"engine": "Holt-Winters (NumPy)", "history_points": 7, "forecast_points": 14}', NULL, '2026-03-21 07:22:49.948309+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (310, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:22:54.384197+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (311, '/ai/recommend/{user_id}', 'f8535c0c-4f47-483e-b7b3-f63c563af1cc', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:22:55.744163+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (312, '/ai/recommend/{user_id}', 'guest-popular', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:23:01.633465+00');
INSERT INTO ai.nhat_ky_suy_luan (ma_nhat_ky, diem_cuoi, ma_nguoi_dung, trang_thai, do_tre_ms, du_lieu_yeu_cau, du_lieu_phan_hoi, thong_tin_loi, ngay_tao) VALUES (313, '/ai/recommend/{user_id}', 'f8535c0c-4f47-483e-b7b3-f63c563af1cc', 'success', 0, '{"limit": 3}', '{"count": 3, "is_personalized": false}', NULL, '2026-03-21 07:23:02.610093+00');


--
-- Data for Name: chi_nhanh; Type: TABLE DATA; Schema: identity; Owner: admin
--

INSERT INTO identity.chi_nhanh (ma_chi_nhanh, ten_chi_nhanh, dia_chi, so_dien_thoai, trang_thai, ngay_tao, ngay_cap_nhat, thanh_pho, quan_huyen, hinh_anh_url, gio_mo_cua, gio_dong_cua, map_url) VALUES ('THANHAN', 'thành an', 'Binh Hien, Quan Hai Chau, Da Nang', NULL, 'ACTIVE', '2026-03-17 03:42:41.993904', '2026-03-17 03:42:41.993904', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO identity.chi_nhanh (ma_chi_nhanh, ten_chi_nhanh, dia_chi, so_dien_thoai, trang_thai, ngay_tao, ngay_cap_nhat, thanh_pho, quan_huyen, hinh_anh_url, gio_mo_cua, gio_dong_cua, map_url) VALUES ('MAC_DINH_CHI', 'HCM Mạc Đĩnh Chi', 'Cơ sở Mạc Đĩnh Chi, TP.HCM', NULL, 'ACTIVE', '2026-03-15 07:32:26.536298', '2026-03-20 22:38:31.374976', 'Hồ Chí Minh', 'Phường Sài Gòn', 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=80', '07:00', '22:00', 'https://www.google.com/maps/search/?api=1&query=28+Ter+B+Mac+Dinh+Chi+Phuong+Sai+Gon+Thanh+pho+Ho+Chi+Minh');
INSERT INTO identity.chi_nhanh (ma_chi_nhanh, ten_chi_nhanh, dia_chi, so_dien_thoai, trang_thai, ngay_tao, ngay_cap_nhat, thanh_pho, quan_huyen, hinh_anh_url, gio_mo_cua, gio_dong_cua, map_url) VALUES ('THE_GRACE_TOWER', 'HCM The Grace Tower', 'The Grace Tower, TP.HCM', NULL, 'ACTIVE', '2026-03-15 07:32:26.5506', '2026-03-20 22:38:31.395971', 'Hồ Chí Minh', 'Tân Phú', 'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?auto=format&fit=crop&w=1200&q=80', '07:00', '22:00', 'https://www.google.com/maps/search/?api=1&query=71+Hoang+Van+Thai+Tan+Phu+Quan+7+Thanh+pho+Ho+Chi+Minh');
INSERT INTO identity.chi_nhanh (ma_chi_nhanh, ten_chi_nhanh, dia_chi, so_dien_thoai, trang_thai, ngay_tao, ngay_cap_nhat, thanh_pho, quan_huyen, hinh_anh_url, gio_mo_cua, gio_dong_cua, map_url) VALUES ('SIGNATURE_CRESCENT_MALL', 'HCM Signature by The Avengers House', 'TTTM Crescent Mall, 101 Tôn Dật Tiên, Phường Tân Phú, Quận 7, Thành phố Hồ Chí Minh', NULL, 'ACTIVE', '2026-03-20 22:38:31.40311', '2026-03-20 22:38:31.40311', 'Hồ Chí Minh', 'Tân Phú', 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80', '07:00', '22:00', 'https://www.google.com/maps/search/?api=1&query=Crescent+Mall+101+Ton+Dat+Tien+Quan+7+Thanh+pho+Ho+Chi+Minh');
INSERT INTO identity.chi_nhanh (ma_chi_nhanh, ten_chi_nhanh, dia_chi, so_dien_thoai, trang_thai, ngay_tao, ngay_cap_nhat, thanh_pho, quan_huyen, hinh_anh_url, gio_mo_cua, gio_dong_cua, map_url) VALUES ('HOANG_VIET', 'HCM Hoàng Việt', '17 Út Tịch, Quận Tân Bình, Hồ Chí Minh', NULL, 'ACTIVE', '2026-03-20 22:38:31.412773', '2026-03-20 22:38:31.412773', 'Hồ Chí Minh', 'Tân Bình', 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80', '07:00', '22:00', 'https://www.google.com/maps/search/?api=1&query=17+Ut+Tich+Quan+Tan+Binh+Ho+Chi+Minh');
INSERT INTO identity.chi_nhanh (ma_chi_nhanh, ten_chi_nhanh, dia_chi, so_dien_thoai, trang_thai, ngay_tao, ngay_cap_nhat, thanh_pho, quan_huyen, hinh_anh_url, gio_mo_cua, gio_dong_cua, map_url) VALUES ('LU_GIA', 'HCM Lữ Gia', '64A Lữ Gia, Phường 15, Quận 11, Hồ Chí Minh', NULL, 'ACTIVE', '2026-03-20 22:38:31.418882', '2026-03-20 22:38:31.418882', 'Hồ Chí Minh', 'Quận 11', 'https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1200&q=80', '07:00', '22:00', 'https://www.google.com/maps/search/?api=1&query=64A+Lu+Gia+Phuong+15+Quan+11+Ho+Chi+Minh');
INSERT INTO identity.chi_nhanh (ma_chi_nhanh, ten_chi_nhanh, dia_chi, so_dien_thoai, trang_thai, ngay_tao, ngay_cap_nhat, thanh_pho, quan_huyen, hinh_anh_url, gio_mo_cua, gio_dong_cua, map_url) VALUES ('AP_BAC', 'HCM Ấp Bắc', '4 - 6 Ấp Bắc, Quận Tân Bình, Hồ Chí Minh', NULL, 'ACTIVE', '2026-03-20 22:38:31.42494', '2026-03-20 22:38:31.42494', 'Hồ Chí Minh', 'Tân Bình', 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=1200&q=80', '07:00', '21:30', 'https://www.google.com/maps/search/?api=1&query=4-6+Ap+Bac+Quan+Tan+Binh+Ho+Chi+Minh');
INSERT INTO identity.chi_nhanh (ma_chi_nhanh, ten_chi_nhanh, dia_chi, so_dien_thoai, trang_thai, ngay_tao, ngay_cap_nhat, thanh_pho, quan_huyen, hinh_anh_url, gio_mo_cua, gio_dong_cua, map_url) VALUES ('BINH_PHU', 'HCM Bình Phú', '111-113-115 Bình Phú, Quận 6, Hồ Chí Minh', NULL, 'ACTIVE', '2026-03-20 22:38:31.430881', '2026-03-20 22:38:31.430881', 'Hồ Chí Minh', 'Quận 6', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80', '07:00', '22:00', 'https://www.google.com/maps/search/?api=1&query=111-113-115+Binh+Phu+Quan+6+Ho+Chi+Minh');
INSERT INTO identity.chi_nhanh (ma_chi_nhanh, ten_chi_nhanh, dia_chi, so_dien_thoai, trang_thai, ngay_tao, ngay_cap_nhat, thanh_pho, quan_huyen, hinh_anh_url, gio_mo_cua, gio_dong_cua, map_url) VALUES ('PHAN_VAN_TRI_3', 'HCM Phan Văn Trị 3', '190 Phan Văn Trị, Phường 11, Bình Thạnh, Thành phố Hồ Chí Minh', NULL, 'ACTIVE', '2026-03-20 22:38:31.436681', '2026-03-20 22:38:31.436681', 'Hồ Chí Minh', 'Bình Thạnh', 'https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=1200&q=80', '07:00', '22:00', 'https://www.google.com/maps/search/?api=1&query=190+Phan+Van+Tri+Phuong+11+Binh+Thanh+Thanh+pho+Ho+Chi+Minh');
INSERT INTO identity.chi_nhanh (ma_chi_nhanh, ten_chi_nhanh, dia_chi, so_dien_thoai, trang_thai, ngay_tao, ngay_cap_nhat, thanh_pho, quan_huyen, hinh_anh_url, gio_mo_cua, gio_dong_cua, map_url) VALUES ('HOMYLAND_Q2', 'HCM Homyland Q2', 'SH2, Tầng 1 Dự Án Chung cư cao cấp Homyland Riverside, Quận 2, Hồ Chí Minh', NULL, 'ACTIVE', '2026-03-20 22:38:31.442777', '2026-03-20 22:38:31.442777', 'Hồ Chí Minh', 'Quận 2', 'https://images.unsplash.com/photo-1517705008128-361805f42e86?auto=format&fit=crop&w=1200&q=80', '07:00', '22:00', 'https://www.google.com/maps/search/?api=1&query=Homyland+Riverside+Quan+2+Ho+Chi+Minh');
INSERT INTO identity.chi_nhanh (ma_chi_nhanh, ten_chi_nhanh, dia_chi, so_dien_thoai, trang_thai, ngay_tao, ngay_cap_nhat, thanh_pho, quan_huyen, hinh_anh_url, gio_mo_cua, gio_dong_cua, map_url) VALUES ('THAIAN', 'THAIAN', 'dấdadasdasd, Ben Nghe, Quan 1, TP. Ho Chi Minh', '0914835112', 'ACTIVE', '2026-03-21 07:17:36.086262', '2026-03-21 07:17:36.086262', 'TP. Ho Chi Minh', 'Quan 1', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSAPN4IGeYPuQhEdUcqWonEznYRphMwRHHi5A&s', '07:00', '22:00', 'https://maps.app.goo.gl/YzwoPTwVfqjKXS8B9');


--
-- Data for Name: dia_chi_giao_hang; Type: TABLE DATA; Schema: identity; Owner: admin
--

INSERT INTO identity.dia_chi_giao_hang (id, ma_nguoi_dung, ten_dia_chi, dia_chi_day_du, ghi_chu, mac_dinh, ngay_tao, ngay_cap_nhat) VALUES (1, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'KTX', 'KTX Khu A, Dai hoc Cong nghe Moi aaaa', 'Cong A', false, '2026-03-12 15:21:22.350935', '2026-03-17 02:45:15.367983');
INSERT INTO identity.dia_chi_giao_hang (id, ma_nguoi_dung, ten_dia_chi, dia_chi_day_du, ghi_chu, mac_dinh, ngay_tao, ngay_cap_nhat) VALUES (2, 'b81d9738-535e-4475-884d-aeb3b7324f01', '28 Ter B Mạc Đĩnh Chi', '28 Ter B Mạc Đĩnh Chi, Tân Phú, Quận 7, Thành phố Hồ Chí Minh', NULL, true, '2026-03-14 15:43:19.300439', '2026-03-17 02:45:32.09505');
INSERT INTO identity.dia_chi_giao_hang (id, ma_nguoi_dung, ten_dia_chi, dia_chi_day_du, ghi_chu, mac_dinh, ngay_tao, ngay_cap_nhat) VALUES (5, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'annn 2', 'Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh', 'hu', true, '2026-03-21 06:48:51.206544', '2026-03-21 06:49:00.3049');


--
-- Data for Name: khuyen_mai; Type: TABLE DATA; Schema: identity; Owner: admin
--

INSERT INTO identity.khuyen_mai (ma_khuyen_mai, ten_khuyen_mai, mo_ta, loai_khuyen_mai, gia_tri, gia_tri_don_toi_thieu, giam_toi_da, so_luong_toi_da, so_luong_da_dung, gioi_han_moi_nguoi, ngay_bat_dau, ngay_ket_thuc, trang_thai, hien_thi_cho_khach, ten_san_pham_tang, hinh_anh, ngay_tao, ngay_cap_nhat) VALUES ('SUMMER2026', 'GIẢM 10% MÙA HÈ', 'là khách hàng', 'PERCENT', 10.00, 15000.00, 50000.00, 0, 2, 5, NULL, NULL, 'ACTIVE', true, NULL, NULL, '2026-03-15 08:35:27.017107', '2026-03-20 18:41:51.532519');


--
-- Data for Name: khuyen_mai_su_dung; Type: TABLE DATA; Schema: identity; Owner: admin
--

INSERT INTO identity.khuyen_mai_su_dung (id, ma_khuyen_mai, ma_nguoi_dung, ma_don_hang, so_tien_giam, ngay_su_dung) VALUES (1, 'SUMMER2026', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'df84e119-6e03-47c5-b885-60b49b122a85', 5800.00, '2026-03-17 04:04:54.35669');
INSERT INTO identity.khuyen_mai_su_dung (id, ma_khuyen_mai, ma_nguoi_dung, ma_don_hang, so_tien_giam, ngay_su_dung) VALUES (2, 'SUMMER2026', 'b81d9738-535e-4475-884d-aeb3b7324f01', '44174905-2603-4a1b-a387-02537473830f', 4500.00, '2026-03-20 18:41:51.53791');


--
-- Data for Name: nguoi_dung; Type: TABLE DATA; Schema: identity; Owner: admin
--

INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('1af8efc4-4e07-4578-b34e-b4fd5f8b6ec3', 'thaian_staff_signaturecrescentmall', '$2b$10$x2zu12QE3wZARXjrr001Z.BUzZh8Tpd8uUyHAjCwNG3jrPdXq01Ru', 'Thái An - Nhân viên cơ sở Signature by The Avengers House', 'thaian_staff_signaturecrescentmall', NULL, NULL, 'ACTIVE', 0, '2026-03-20 22:38:31.571463', 'STAFF', 'SIGNATURE_CRESCENT_MALL', 'HCM Signature by The Avengers House', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('e4085f96-bc91-412e-8bcc-2b529703c64d', 'fix86749@mail.com', '$2b$10$Br8iRwT9qBnECpfTBxDEPeKzVATbv7L/aAeSXE7mpPabR/UZ7ic/2', 'Fix User', 'fix86749@mail.com', NULL, NULL, 'ACTIVE', 0, '2026-03-13 11:59:45.732631', 'CUSTOMER', NULL, NULL, NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('27fbca00-a226-4d07-b331-e3c34cd0f63c', 'thanhan@gmail.com', '$2b$10$EKlQiWhSDjS2v/vz0zhbVeVFLniMyZd8wa09mR6xK1jHxzQqR8dGO', 'thanh an', 'thanhan@gmail.com', NULL, NULL, 'ACTIVE', 29, '2026-03-13 12:05:44.570514', 'CUSTOMER', NULL, NULL, NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('c3ed7560-01a5-42be-a661-45c0cfefbb5d', 'thaian@gmail.com', '$2b$10$0rCvF.10cj0zGz.mXJIQV.GwdXxPsZvXoYPaDO2m3/6iOWaj1AtSm', 'thaian1', 'thaian@gmail.com', NULL, NULL, 'ACTIVE', 0, '2026-03-13 14:12:06.043199', 'CUSTOMER', NULL, NULL, NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('1850d44e-83b8-407e-99db-a92dd0517f6d', 'thaian_manager_signaturecrescentmall', '$2b$10$b/YJVtzSpQy5xGQAos7bPOw0IpDoMAuWi.vxJ.lxBlpnntOOVq7Hu', 'Thái An - Quản lý cơ sở Signature by The Avengers House', 'thaian_manager_signaturecrescentmall', NULL, NULL, 'ACTIVE', 0, '2026-03-20 22:38:31.659453', 'MANAGER', 'SIGNATURE_CRESCENT_MALL', 'HCM Signature by The Avengers House', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('a945ca5d-2055-4f49-bebb-e706c267d9bb', 'thaian_staff', '$2b$10$4cO4d6W7LoBEPEsLo68pMeXOyhB1j8q2PTFL6eMim82N5Hy8PcHti', 'Thái An (Nhân viên cửa hàng)', 'thaian_staff', NULL, NULL, 'ACTIVE', 0, '2026-03-13 14:35:08.665625', 'STAFF', NULL, NULL, NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('714fcc38-8692-49f9-9d1c-2f0fbf4f509e', 'thaian_manager', '$2b$10$7O4U5vqFp6C5m2zcBUPbM.HbwoFd5OMBavD0hMC.ZAyfte23tuSn.', 'Thái An (Quản lý cửa hàng)', 'thaian_manager', NULL, NULL, 'ACTIVE', 0, '2026-03-14 00:59:59.699192', 'MANAGER', NULL, NULL, NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('07df93a5-09ad-4bad-b5f2-e0f3cf75a898', 'thaian_staff_hoangviet', '$2b$10$D7szA.pyev11SAyzJBnjTOHbPY00RTNtGah4Y1hKrO1Ysd8Bm2zF6', 'Thái An - Nhân viên cơ sở Hoàng Việt', 'thaian_staff_hoangviet', NULL, NULL, 'ACTIVE', 0, '2026-03-20 22:38:31.736436', 'STAFF', 'HOANG_VIET', 'HCM Hoàng Việt', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('2ad00b0e-c91a-4419-bd98-253d2472307f', 'thaian_manager_hoangviet', '$2b$10$YWugjTHAg6idqdaFQBxayuI.srfsnObTXHVVuX7S4ffzIYEMPVUea', 'Thái An - Quản lý cơ sở Hoàng Việt', 'thaian_manager_hoangviet', NULL, NULL, 'ACTIVE', 0, '2026-03-20 22:38:31.807322', 'MANAGER', 'HOANG_VIET', 'HCM Hoàng Việt', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('af7da2da-eaa7-4349-8ce3-7eaa2f3213ad', 'thaian_admin', '$2b$10$Nu550XT6eiGep910e3r1wuIWV96HuU65/JPAhbwUCGBUpSS1GH5R.', 'Thái An - Quản trị viên hệ thống', 'thaian_admin', NULL, NULL, 'ACTIVE', 0, '2026-03-14 20:12:03.584089', 'ADMIN', NULL, NULL, NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('4fb38930-7083-4f80-b3c0-f101660b2da0', 'conmeonokeumeomeogaugau@gmail.com', '$2b$10$hWIkPd3NFTZ2o59sZ.9KleR6uFC4OUAXbl4vuI1B6hwERrTCKsC7y', 'gaugau conmeo', 'conmeonokeumeomeogaugau@gmail.com', NULL, 'https://lh3.googleusercontent.com/a/ACg8ocIJo8pD959MDnowo0IgpcKFq6A3vRhDVo_7K0PFuCSYQspA2Yk=s96-c', 'ACTIVE', 0, '2026-03-19 14:57:38.929619', 'CUSTOMER', NULL, NULL, NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('ab8dab13-bdd4-4f47-9e3a-cc67cb484638', 'haianhnguyn@gmail.com', '$2b$10$xjUYPAMh1ioL.YrUCNFOhO/uSn9Iwh3r67k9JLOGRgU6AsiVkyOZO', 'hải anh', 'haianhnguyn@gmail.com', NULL, NULL, 'ACTIVE', 0, '2026-03-20 16:21:51.350751', 'CUSTOMER', NULL, NULL, NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('0db430b7-9ed0-401d-a06f-30a75b5de61a', '', '$2b$10$HHxrwwrSpQ4T8vazY7HAPeT5PXb6fziZNi8Emjv2razQy86Z6HFF2', 'haianh', '', NULL, NULL, 'ACTIVE', 0, '2026-03-20 16:24:29.806516', 'CUSTOMER', NULL, NULL, NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('3ecc0f3f-6eaf-45bd-aeda-0fb13ab5166d', 'thaian_staff_lugia', '$2b$10$0LdUZByM0U27vqTa0PRhJugJX8ssAeDRKcHRAOSqNNTeaa5vQNKKC', 'Thái An - Nhân viên cơ sở Lữ Gia', 'thaian_staff_lugia', NULL, NULL, 'ACTIVE', 0, '2026-03-20 22:38:31.877653', 'STAFF', 'LU_GIA', 'HCM Lữ Gia', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('3f701d87-1e7f-46ad-8a5d-3311df9b7dce', 'thaian1@gmail.com', '$2b$10$Ag536bgyboXxPXVdyoU3BezNL6HUmM0qoStLePes.4mXhjdQVU6Te', 'thaian', 'thaian1@gmail.com', NULL, NULL, 'ACTIVE', 0, '2026-03-20 16:27:13.673935', 'CUSTOMER', NULL, NULL, NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('fc1f03da-710a-469d-bdcd-02ec0615c45f', 'thaian2@gmail.com', '$2b$10$WUJoeMz1frq3XPR1ky3IUuuktnHjhbDl5kRPvgNjkDfqfA3XHfaqq', 'thaian2', 'thaian2@gmail.com', NULL, NULL, 'ACTIVE', 0, '2026-03-20 17:53:30.196718', 'CUSTOMER', NULL, NULL, NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('e777803d-3e4d-4e37-8ef6-4ecc576b4bbc', 'thaian_manager_lugia', '$2b$10$PbwoI6o6yX8.8F.ZYS51EePgzkLLCqy12Fy08Mf7VZ2rN8J49RotC', 'Thái An - Quản lý cơ sở Lữ Gia', 'thaian_manager_lugia', NULL, NULL, 'ACTIVE', 0, '2026-03-20 22:38:31.944857', 'MANAGER', 'LU_GIA', 'HCM Lữ Gia', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('203fd1cb-2e87-4efa-834a-75243cad355b', 'thaian_staff_apbac', '$2b$10$DKzBPs5XQArem8FxpLCYMu.5b.rNcvYu8g2/yhYHT2C3/ZOACpGVK', 'Thái An - Nhân viên cơ sở Ấp Bắc', 'thaian_staff_apbac', NULL, NULL, 'ACTIVE', 0, '2026-03-20 22:38:32.025742', 'STAFF', 'AP_BAC', 'HCM Ấp Bắc', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('2a86b88c-9ab5-4801-93b2-65953835f1b8', 'thaianvtk@gmail.com', 'GOOGLE_AUTH', 'an nguyễn thái', 'thaianvtk@gmail.com', NULL, 'https://lh3.googleusercontent.com/a/ACg8ocIo3J7XKH5NJWZKXnQwS3QIlcBUMHz42hCslyiMfw8cAzDAHg=s96-c', 'ACTIVE', 0, '2026-03-20 18:10:11.455161', 'CUSTOMER', NULL, NULL, NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('86bd00a2-395e-42e1-8863-2d8492c64c1d', 'thaian-nv', '$2b$10$ej0uY7ddXvQ7D0qlB9dGeuxZ65ChBJOHAYw4qeyX4PoVuOKY/f4iO', 'thaian-nv', 'thaian-nv@gmail.com', NULL, NULL, 'ACTIVE', 0, '2026-03-20 21:46:08.606549', 'STAFF', 'MAC_DINH_CHI', 'Mạc Đĩnh Chi', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('60e6dc26-351f-47a5-abe3-0d892272c1ab', 'thaian_staff_macdinhchi', '$2b$10$yronmJzIUrT3rKp27sudPOv1xrw35hoF7N3uJ3UY12O1PmnlE/fXK', 'Thái An - Nhân viên cơ sở Mạc Đĩnh Chi', 'thaian_staff_macdinhchi', NULL, NULL, 'ACTIVE', 0, '2026-03-14 14:56:39.448884', 'STAFF', 'MAC_DINH_CHI', 'HCM Mạc Đĩnh Chi', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('03f1a264-f077-44b4-96da-9de76cc75989', 'thaian_manager_macdinhchi', '$2b$10$hGnAI/xVJKOk2BRP6jwW1ebET1ewzmztcBc9jc8ETNCoVrhJ53G9K', 'Thái An - Quản lý cơ sở Mạc Đĩnh Chi', 'thaian_manager_macdinhchi', NULL, NULL, 'ACTIVE', 0, '2026-03-14 14:56:39.604262', 'MANAGER', 'MAC_DINH_CHI', 'HCM Mạc Đĩnh Chi', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('702cbcb9-9722-4d40-884d-51fff33ece8f', 'thaian_staff_thegracetower', '$2b$10$IRPMapvrOSF587JvwasXD.mntANygqnixcp6zIp9ITEzawzLgQFuK', 'Thái An - Nhân viên cơ sở The Grace Tower', 'thaian_staff_thegracetower', NULL, NULL, 'ACTIVE', 0, '2026-03-14 14:56:39.742949', 'STAFF', 'THE_GRACE_TOWER', 'HCM The Grace Tower', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'thaian_manager_thegracetower', '$2b$10$VoaMM8IDrT0AJBAVKm9jfufIBNZCB1oRYCes6L6cbfocV2MOL/s9G', 'Thái An - Quản lý cơ sở The Grace Tower', 'thaian_manager_thegracetower', NULL, NULL, 'ACTIVE', 0, '2026-03-14 14:56:39.884026', 'MANAGER', 'THE_GRACE_TOWER', 'HCM The Grace Tower', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('628300ca-65ed-419b-9860-fee5aa2e5d4b', 'thaian_manager_apbac', '$2b$10$g9Gkcl0gDvj4/OttZ1dBFu3lm2Em.uFyovHxM6hDdVXdAhgYqbulG', 'Thái An - Quản lý cơ sở Ấp Bắc', 'thaian_manager_apbac', NULL, NULL, 'ACTIVE', 0, '2026-03-20 22:38:32.117913', 'MANAGER', 'AP_BAC', 'HCM Ấp Bắc', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('1864ff64-cb5f-4b7a-b7a0-b7a796ead211', 'thaian_staff_binhphu', '$2b$10$gNrxKOdXzToUqSaI4FuEBuuQts6Q6dzFhHreV0uFY9cyRx5HRMzXa', 'Thái An - Nhân viên cơ sở Bình Phú', 'thaian_staff_binhphu', NULL, NULL, 'ACTIVE', 0, '2026-03-20 22:38:32.191478', 'STAFF', 'BINH_PHU', 'HCM Bình Phú', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('b21c2029-1673-4b87-a439-6b2d791df92b', 'thaian_manager_binhphu', '$2b$10$DzYcI/JQQzLz3LsApY/1j.QrNMxw2jnYaRQr5imafzYrlRTSDexf6', 'Thái An - Quản lý cơ sở Bình Phú', 'thaian_manager_binhphu', NULL, NULL, 'ACTIVE', 0, '2026-03-20 22:38:32.260245', 'MANAGER', 'BINH_PHU', 'HCM Bình Phú', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('6a000023-d473-4a4d-9f5a-7ef98ab4f86b', 'thaian_staff_phanvantri3', '$2b$10$PSQjRCZcHj9jGxwWU7HI2e655fWdD2//gz04ljtMhG8oW5VxZpaM2', 'Thái An - Nhân viên cơ sở Phan Văn Trị 3', 'thaian_staff_phanvantri3', NULL, NULL, 'ACTIVE', 0, '2026-03-20 22:38:32.32911', 'STAFF', 'PHAN_VAN_TRI_3', 'HCM Phan Văn Trị 3', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('56295d2c-6602-4c63-8b51-5229c4cedd96', 'thaian_manager_phanvantri3', '$2b$10$1oxPwiI.L/zIycx3cPxV3.lcQnl/hgeRsCePiw5WF6F01/vFsA5P6', 'Thái An - Quản lý cơ sở Phan Văn Trị 3', 'thaian_manager_phanvantri3', NULL, NULL, 'ACTIVE', 0, '2026-03-20 22:38:32.396111', 'MANAGER', 'PHAN_VAN_TRI_3', 'HCM Phan Văn Trị 3', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('f131c682-14ac-4c23-aa8b-a8c5e1748cbe', 'thaian_staff_homylandq2', '$2b$10$1jJRfz4MdFmNMKUFxXrNXurIUATeevstL7C4wRNMMCCuA/JUKKIPy', 'Thái An - Nhân viên cơ sở Homyland Q2', 'thaian_staff_homylandq2', NULL, NULL, 'ACTIVE', 0, '2026-03-20 22:38:32.465311', 'STAFF', 'HOMYLAND_Q2', 'HCM Homyland Q2', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('bce38da3-765c-472d-a83e-2227511f5eb2', 'thaian_manager_homylandq2', '$2b$10$rAlZqK04D9crY5RYDts3O.uEdvmWNPVepYK2HO/bNdT4BxEJF80fS', 'Thái An - Quản lý cơ sở Homyland Q2', 'thaian_manager_homylandq2', NULL, NULL, 'ACTIVE', 0, '2026-03-20 22:38:32.537501', 'MANAGER', 'HOMYLAND_Q2', 'HCM Homyland Q2', NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('121f1666-ca28-4482-96a0-68841cb03504', 'thanhan2@gmail.com', '$2b$10$4whqwAsbsyoYGts0bwmfVOG46/8y0guybwuiEUSpa9WppdmouoREe', 'thanhan2', 'thanhan2@gmail.com', NULL, NULL, 'ACTIVE', 0, '2026-03-21 06:40:19.611733', 'CUSTOMER', NULL, NULL, NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('b81d9738-535e-4475-884d-aeb3b7324f01', 'ankudo1234@gmail.com', '$2b$10$QWnwk/zWS8tBHQ3/AWo/AOTJ.DzCsmrXfyAHdFTvS8OsS/kSZRcQa', 'thái an hello hehe hihi', 'ankudo1234@gmail.com', '0914835114', 'https://example.com/a.jpg', 'ACTIVE', 2020, '2026-03-11 01:04:42.084098', 'CUSTOMER', NULL, NULL, NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'thanhan8912@gmail.com', '$2b$10$FZJCxti.yOdg4H42Hjo2UO6mFzzZ6w8ne.UTl8iSzLghtWDc6qmVu', 'An Thanh', 'thanhan8912@gmail.com', NULL, 'https://lh3.googleusercontent.com/a/ACg8ocLJtxd5GcwD_PhzG5e94-MbzmdXRvqOuqR3FiNo7ndt6gvZ0g=s96-c', 'ACTIVE', 156, '2026-03-21 06:39:56.380089', 'CUSTOMER', NULL, NULL, NULL, NULL, NULL, 0);
INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, avatar_url, trang_thai, diem_loyalty, ngay_tao, vai_tro, co_so_ma, co_so_ten, reset_password_code_hash, reset_password_code_expires_at, reset_password_requested_at, reset_password_attempts) VALUES ('81c62ad4-48db-43ff-be91-3ba7f5b8b68f', 'thanhan-nv', '$2b$10$MKa8oUO8sNs565sB7aWfF.ptnN0K7RmXO38oHqLZndPS0dfCwGrPy', 'thanhan-nv', 'thanhan-nv@gmail.com', NULL, NULL, 'ACTIVE', 0, '2026-03-21 07:12:06.379957', 'STAFF', 'MAC_DINH_CHI', 'HCM Mạc Đĩnh Chi', NULL, NULL, NULL, 0);


--
-- Data for Name: ton_kho_san_pham; Type: TABLE DATA; Schema: inventory; Owner: admin
--

INSERT INTO inventory.ton_kho_san_pham (id, ma_san_pham, so_luong_ton, muc_canh_bao, dang_kinh_doanh, cap_nhat_luc, co_so_ma) VALUES (1, 1, 0, 0, true, '2026-03-13 15:47:16.728172', 'MAC_DINH_CHI');
INSERT INTO inventory.ton_kho_san_pham (id, ma_san_pham, so_luong_ton, muc_canh_bao, dang_kinh_doanh, cap_nhat_luc, co_so_ma) VALUES (2, 3, 0, 0, true, '2026-03-14 18:23:41.359719', 'THE_GRACE_TOWER');
INSERT INTO inventory.ton_kho_san_pham (id, ma_san_pham, so_luong_ton, muc_canh_bao, dang_kinh_doanh, cap_nhat_luc, co_so_ma) VALUES (3, 2, 0, 0, true, '2026-03-14 19:07:12.676947', 'THE_GRACE_TOWER');
INSERT INTO inventory.ton_kho_san_pham (id, ma_san_pham, so_luong_ton, muc_canh_bao, dang_kinh_doanh, cap_nhat_luc, co_so_ma) VALUES (4, 2, 0, 0, true, '2026-03-17 23:46:31.55914', 'MAC_DINH_CHI');
INSERT INTO inventory.ton_kho_san_pham (id, ma_san_pham, so_luong_ton, muc_canh_bao, dang_kinh_doanh, cap_nhat_luc, co_so_ma) VALUES (5, 17, 0, 0, false, '2026-03-21 07:02:00.908817', 'MAC_DINH_CHI');


--
-- Data for Name: danh_muc; Type: TABLE DATA; Schema: menu; Owner: admin
--

INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (1, 'Cà phê', '☕');
INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (2, 'Trà', '🍃');
INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (3, 'Đồ ăn', '🍕');
INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (4, 'Latte', NULL);
INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (5, 'Frappe', NULL);
INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (6, 'Trà Xanh - Chocolate', NULL);
INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (7, 'Matcha', NULL);
INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (8, 'Trà Trái Cây - HiTea', NULL);
INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (9, 'Trà Sữa', NULL);
INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (10, 'Bánh Ngọt', NULL);
INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (11, 'Pizza & Pasta', NULL);
INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (12, 'Món Mới Phải Thử', NULL);
INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (13, 'Bánh Mặn', NULL);
INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (14, 'Salad', NULL);
INSERT INTO menu.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (15, 'Khác', NULL);


--
-- Data for Name: san_pham; Type: TABLE DATA; Schema: menu; Owner: admin
--

INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (17, 'A-Mê Mơ', 49000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/americano_mo_5c282c669192440abd9853c4d261fe2f_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (18, 'A-Mê Yuzu', 49000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/americano_thanh_yen_35e4c9612d944fab83c2a386f8d72cab_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (19, 'Latte Hạnh Nhân', 59000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1746441513_almond-coffee_a88253af2af24009b4b937ba17128630_grande.png', true, 4, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (20, 'Latte Classic', 55000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1746439218_latte-classic_592dc04d7d7c4a9d8d3bc2d113c6e73b_grande.png', true, 4, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (2, 'Trà Đào Cam Sả', 45000.00, 'Trà đào thơm mát, tươi mới', '/images/products/tra-dao-cam-sa.jpg', true, 2, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (1, 'Cà Phê Sữa Đá', 39000.00, 'Cà phê sữa lạnh thơm ngon', 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_da_73fed306bafb4f87b4cb44573c900388_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (3, 'Pizza 5 Cheese', 39000.00, 'Pizza 5 loại phô mai thơm ngon', '/images/products/pizza-5-cheese.jpg', true, 3, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (6, 'hihi', 39000.00, NULL, '/images/products/hihi.png', true, 1, 45000.00, true, true);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (7, 'A-Mê Đào', 49000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/americano_dao_3ad44119ea024ca78d1d1f7710bef2e0_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (4, 'Espresso Đá', 49000.00, 'Một tách Espresso nguyên bản được bắt đầu bởi những hạt Arabica chất lượng, phối trộn với tỉ lệ cân đối hạt Robusta, cho ra vị ngọt caramel, vị chua dịu và sánh đặc.', 'https://cdn.hstatic.net/products/1000075078/espresso_da_589e3a4d46e94f72b26752ee64b93e7b_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (5, 'Americano Nóng', 45000.00, 'Americano được pha chế bằng cách pha thêm nước với tỷ lệ nhất định vào tách cà phê Espresso, từ đó mang lại hương vị nhẹ nhàng và giữ trọn được mùi hương cà phê đặc trưng.', 'https://cdn.hstatic.net/products/1000075078/americano_nong_785ea48734b741858eaae04501a36fa5_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (11, 'Latte Nóng', 59000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/latte_nong_77d6c8dd1ce84d0f900f83d99f069557_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (12, 'Cappuccino Đá', 55000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/cappucino_da_691da3dddf5744d698974dd6596677bc_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (13, 'Cappuccino Nóng', 55000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/cappucino_nong_fa141e298bc843d8a934a720189bf3e2_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (21, 'Latte Bạc Xỉu', 49000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1767588144_latte-bac-xiu_01079019ce3d4c9fa385cb30ed33cd46_grande.png', true, 4, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (22, 'Latte Hazelnut', 59000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1746441372_halzenut-latte_faaa820831cc448980ab9d003390f33a_grande.png', true, 4, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (23, 'Frappe Matcha Tây Bắc', 65000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1746441845_matcha-frappe_178c807d212f4a11ac21266f97468bfb_grande.png', true, 5, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (8, 'Ethiopia Americano Đá', 34500.00, NULL, 'https://cdn.hstatic.net/products/1000075078/soe_da_dq_c1403e7a3a384e4786e71994737b0981_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (9, 'Ethiopia Americano Nóng', 34500.00, NULL, 'https://cdn.hstatic.net/products/1000075078/soe_nong_dq_bb13f9167dbd428d8ed7bf51e73ba5e7_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (10, 'Espresso Nóng', 45000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/espresso_shot_ce837696dded42d4a3135d9302b68f31_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (14, 'Caramel Macchiato Đá', 65000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/caramel_macchiato_da_5549b94596d94133973b97ea2d04d735_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (15, 'Caramel Macchiato Nóng', 69000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/caramel_macchiato_nong_19dcb8fe095f44e58c844f96340db62a_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (16, 'A-Mê Classic', 39000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/a-me_classic_dfbdc3b2b0124ca7bb3b177fb12871c1_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (24, 'Frappe Almond', 65000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1746443342_almond-frappe_1fb4c2599c284b7ab9bca67c581005d8_grande.png', true, 5, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (25, 'Frappe Hazelnut', 65000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1746443470_halzenut-frappe_1482bc4321644c7cb3d23daf7f96cba6_grande.png', true, 5, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (26, 'Frappe Choco Chip', 65000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1746460836_choco-chip-frappe_b7287bbb458c439eba0bc69597368173_grande.png', true, 5, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (27, 'Bạc Xỉu Foam Dừa', 45000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/bac_xiu_foam_dua_4d84183a347145be99edbdd844bf17f8_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (35, 'Cold Brew Kim Quất', 49000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/cold_brew_kim_quat_95ae6104aa86446aa7d2185c9f06e0bf_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (37, 'Matcha Latte Tây Bắc (Nóng)', 49000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/matcha_latte_tay_bac_nong_d591c8251dc64fb987118a408e861b09_grande.png', true, 6, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (38, 'Matcha Latte Kyoto', 55000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1745246722_matcha-latte_e183c01ed5844343882d089b37b6239f_grande.png', true, 7, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (39, 'Matcha Tây Bắc Trân Châu Hoàng Kim', 49000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1745246677_matcha-dao-copy_f96bb5d6b4ad4cf9a7a8a2006f1ad8c1_grande.png', true, 7, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (40, 'Trà Đào Cam Sả - Nóng', 59000.00, NULL, 'https://product.hstatic.net/1000075078/product/1737356382_oolong-tu-quy-sen-nong-copy_79b957510bcb4e6f8bb7d938f0448ab9_grande.png', true, 8, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (41, 'Trà Đào Cam Sả - Đá', 49000.00, NULL, 'https://product.hstatic.net/1000075078/product/1737356280_tra-dao-cam-sa_9c46cceef5004e689b746e8ec0e47c34_grande.png', true, 8, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (42, 'Trà Phúc Kiến Sen (Nóng)', 59000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/oolong_tu_quy_sen_nong_eb6f855cb05a423cbce31805f4a09dab_grande.png', true, 8, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (43, 'Trà Phúc Kiến Sen', 49000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/oolong_tu_quy_sen_da_45f85b5cedf64902b2a85fb969372d82_grande.png', true, 8, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (44, 'Trà Sữa Oolong Tứ Quý Sương Sáo', 55000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1751601456_tra-sua-oolong-tu-quy-suong-sao_c22c1bf76ba04c469c8d7f529c7d60f5_grande.png', true, 9, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (45, 'Trà Đen Macchiato', 55000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1751597791_tra-den-macchiato_7dceaebbb66f4cba8c92d7f6d713fa33_grande.png', true, 9, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (46, 'Chocolate Đá', 55000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/so_co_la_da_660ca0c6384b456b9eae735bfa9a9f2b_grande.png', true, 6, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (47, 'Chocolate Nóng', 55000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/so_co_la_nong_45c13bb985534867a7c0c8634e2f3349_grande.png', true, 6, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (48, 'Mochi Kem Trà Sữa Trân Châu', 19000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1737355411_mochi-tra-sua_bd68fdd9fe844f24b6d0fb772486263e_grande.png', true, 10, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (49, 'Mochi Kem Phúc Bồn Tử', 19000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1737355355_mochi-phuc-bon-tu_3a394194635c45a88a3d28969f2024c2_grande.png', true, 10, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (50, 'Mochi Kem Việt Quất', 19000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1737355361_mochi-viet-quat_c1acf906f8b94ff78fb197deefdd683d_grande.png', true, 10, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (51, 'Mochi Kem Chocolate', 19000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1737355348_mochi-choco_4a95ec58b13f410f884bee942ad49b51_grande.png', true, 10, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (52, 'Wafu Pasta Bò Bằm Xốt Bolognese', 59000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1742826512_wafu-pasta-bo-bam-xot-bolognese_a0019977ac644600a1b62916178d439c_grande.png', true, 11, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (53, 'Wafu Pasta Bò Karubi Xốt Miso Butter', 79000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1742826184_ba-chi-bo-xot-miso-butter-app_0cf77e7943dd4216aaa2957184f7a28a_grande.png', true, 11, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (54, 'Wafu Pasta Cá Bào Trứng Onsen Xốt Mentaiko', 69000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1742826409_wafu-pasta-ca-bao-trung-onsen-xot-mentaiko_6bd1486b8ca043b6b76dc8b10893ea93_grande.png', true, 12, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (55, 'Wafu Pasta Heo Nướng Xốt Shoyu Butter', 59000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1742826471_wafu-pasta-heo-nuong-xot-shoyu-butter_0a61c997465949488437957e9ee610e5_grande.png', true, 11, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (56, 'Pizza Hawaiian', 49000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1760452011_new-pizza-ham-dua_83eef655e1334756bf028fe216dbd596_grande.png', true, 12, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (57, 'Pizza New York 5 Cheese', 49000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1739269754_pizza-5cheese_39213eb56f6d4a1192b2001f06c37a5b_grande.png', true, 11, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (58, 'Pizza New York Bò Bằm Phô Mai', 49000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1739269763_pizza-sotbobam_c0b95e91c6154a9098f58b9e781266f9_grande.png', true, 11, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (59, 'Pizza New York Pepperoni', 49000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1739269747_pizza-pepperoni_01dd33aa54b7493aaa42b1048c089fbf_grande.png', true, 11, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (60, 'Pizza Tomyum Hải Sản', 59000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1772184957_pizza-tomyum-hai-san_c2577d8b603e49bbb8d8e91c0cf91025_grande.png', true, 12, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (61, 'Soft Pizza Chà Bông Trứng Cút', 39000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/1768278535_soft-pizza-cha-bong-trung-cut_13a79fcc3cc0452ea00217864e4b3549_grande.png', true, 13, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (62, 'Salad Cải Xoăn Xốt Yuzu', 49000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/salad_cai_xoan_xot_yuzu_cea0b33b62a841efbfe596069a89ae63_grande.png', true, 14, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (63, 'Salad Rau Rocket và Hạt', 49000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/nut_salad_630e8fb2fe8f448b8306dd8ffd1926a5_grande.png', true, 14, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (64, 'Túi Matcha Tốt', 169000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/mer_29aa13aee84048dcb525b2f39efbb4af_grande.png', true, 15, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (29, 'Bạc Xỉu', 39000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/bac_xiu_truyen_thong_2694ea6d85c047fa9a559c2a85f0e766_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (30, 'Bạc Xỉu Nóng', 39000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/bac_xiu_truyen_thong_nong_3cf582dc460a422b939c62f86e41ee4e_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (32, 'Cà Phê Sữa Nóng', 39000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_nong_249262a0d36a4861932e17efb9706d13_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (33, 'Cà Phê Đen Đá', 39000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_den_da_66c9be0094354e8693117543770b2661_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (34, 'Cold Brew Truyền Thống', 45000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/cold_brew_truyen_thong_7d8799b543124cc7946a9701ba30b149_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (28, 'Bạc Xỉu Caramel Muối', 45000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/bac_xiu_caramel_muoi_4a995a0bfa5d420ab90dc28b714b5bf5_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (31, 'Cà Phê Đen Nóng', 39000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_den_nong_841bd93375e64d0ba7f4067770fdbd44_grande.png', true, 1, NULL, false, false);
INSERT INTO menu.san_pham (ma_san_pham, ten_san_pham, gia_ban, mo_ta, hinh_anh_url, trang_thai, ma_danh_muc, gia_niem_yet, la_hot, la_moi) VALUES (36, 'Matcha Latte Tây Bắc', 45000.00, NULL, 'https://cdn.hstatic.net/products/1000075078/matcha_latte_tay_bac_da_d5ba2ffade1e4917ab810e626805bc18_grande.png', true, 6, NULL, false, false);


--
-- Data for Name: danh_muc; Type: TABLE DATA; Schema: menu_ci_local; Owner: admin
--

INSERT INTO menu_ci_local.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (1, 'Cà Phê', NULL);
INSERT INTO menu_ci_local.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (2, 'Latte', NULL);
INSERT INTO menu_ci_local.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (3, 'Frappe', NULL);
INSERT INTO menu_ci_local.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (4, 'Trà Xanh - Chocolate', NULL);
INSERT INTO menu_ci_local.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (5, 'Matcha', NULL);
INSERT INTO menu_ci_local.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (6, 'Trà Trái Cây - HiTea', NULL);
INSERT INTO menu_ci_local.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (7, 'Trà Sữa', NULL);
INSERT INTO menu_ci_local.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (8, 'Bánh Ngọt', NULL);
INSERT INTO menu_ci_local.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (9, 'Pizza & Pasta', NULL);
INSERT INTO menu_ci_local.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (10, 'Món Mới Phải Thử', NULL);
INSERT INTO menu_ci_local.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (11, 'Bánh Mặn', NULL);
INSERT INTO menu_ci_local.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (12, 'Salad', NULL);
INSERT INTO menu_ci_local.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (13, 'Khác', NULL);
INSERT INTO menu_ci_local.danh_muc (ma_danh_muc, ten_danh_muc, hinh_anh_icon) VALUES (14, 'CI Test Category', 'test-icon');


--
-- Data for Name: san_pham; Type: TABLE DATA; Schema: menu_ci_local; Owner: admin
--

INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (1, 'A-Mê Đào', 49000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/americano_dao_3ad44119ea024ca78d1d1f7710bef2e0_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (2, 'Ethiopia Americano Đá', 34500.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/soe_da_dq_c1403e7a3a384e4786e71994737b0981_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (3, 'Ethiopia Americano Nóng', 34500.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/soe_nong_dq_bb13f9167dbd428d8ed7bf51e73ba5e7_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (4, 'Espresso Nóng', 45000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/espresso_shot_ce837696dded42d4a3135d9302b68f31_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (5, 'Espresso Đá', 49000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/espresso_da_589e3a4d46e94f72b26752ee64b93e7b_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (6, 'Americano Nóng', 45000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/americano_nong_785ea48734b741858eaae04501a36fa5_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (7, 'Latte Nóng', 59000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/latte_nong_77d6c8dd1ce84d0f900f83d99f069557_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (8, 'Cappuccino Đá', 55000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/cappucino_da_691da3dddf5744d698974dd6596677bc_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (9, 'Cappuccino Nóng', 55000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/cappucino_nong_fa141e298bc843d8a934a720189bf3e2_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (10, 'Caramel Macchiato Đá', 65000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/caramel_macchiato_da_5549b94596d94133973b97ea2d04d735_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (11, 'Caramel Macchiato Nóng', 69000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/caramel_macchiato_nong_19dcb8fe095f44e58c844f96340db62a_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (12, 'A-Mê Classic', 39000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/a-me_classic_dfbdc3b2b0124ca7bb3b177fb12871c1_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (13, 'A-Mê Mơ', 49000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/americano_mo_5c282c669192440abd9853c4d261fe2f_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (14, 'A-Mê Yuzu', 49000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/americano_thanh_yen_35e4c9612d944fab83c2a386f8d72cab_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (15, 'Latte Hạnh Nhân', 59000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1746441513_almond-coffee_a88253af2af24009b4b937ba17128630_grande.png', true, false, false, 2);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (16, 'Latte Classic', 55000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1746439218_latte-classic_592dc04d7d7c4a9d8d3bc2d113c6e73b_grande.png', true, false, false, 2);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (17, 'Latte Bạc Xỉu', 49000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1767588144_latte-bac-xiu_01079019ce3d4c9fa385cb30ed33cd46_grande.png', true, false, false, 2);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (18, 'Latte Hazelnut', 59000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1746441372_halzenut-latte_faaa820831cc448980ab9d003390f33a_grande.png', true, false, false, 2);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (19, 'Frappe Matcha Tây Bắc', 65000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1746441845_matcha-frappe_178c807d212f4a11ac21266f97468bfb_grande.png', true, false, false, 3);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (20, 'Frappe Almond', 65000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1746443342_almond-frappe_1fb4c2599c284b7ab9bca67c581005d8_grande.png', true, false, false, 3);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (21, 'Frappe Hazelnut', 65000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1746443470_halzenut-frappe_1482bc4321644c7cb3d23daf7f96cba6_grande.png', true, false, false, 3);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (22, 'Frappe Choco Chip', 65000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1746460836_choco-chip-frappe_b7287bbb458c439eba0bc69597368173_grande.png', true, false, false, 3);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (23, 'Bạc Xỉu Foam Dừa', 45000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/bac_xiu_foam_dua_4d84183a347145be99edbdd844bf17f8_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (24, 'Bạc Xỉu Caramel Muối', 45000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/bac_xiu_caramel_muoi_4a995a0bfa5d420ab90dc28b714b5bf5_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (25, 'Bạc Xỉu', 39000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/bac_xiu_truyen_thong_2694ea6d85c047fa9a559c2a85f0e766_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (26, 'Bạc Xỉu Nóng', 39000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/bac_xiu_truyen_thong_nong_3cf582dc460a422b939c62f86e41ee4e_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (27, 'Cà Phê Đen Nóng', 39000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_den_nong_841bd93375e64d0ba7f4067770fdbd44_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (28, 'Cà Phê Sữa Nóng', 39000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_nong_249262a0d36a4861932e17efb9706d13_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (29, 'Cà Phê Đen Đá', 39000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_den_da_66c9be0094354e8693117543770b2661_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (30, 'Cà Phê Sữa Đá', 39000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_da_73fed306bafb4f87b4cb44573c900388_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (31, 'Cold Brew Truyền Thống', 45000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/cold_brew_truyen_thong_7d8799b543124cc7946a9701ba30b149_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (32, 'Cold Brew Kim Quất', 49000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/cold_brew_kim_quat_95ae6104aa86446aa7d2185c9f06e0bf_grande.png', true, false, false, 1);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (33, 'Matcha Latte Tây Bắc', 45000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/matcha_latte_tay_bac_da_d5ba2ffade1e4917ab810e626805bc18_grande.png', true, false, false, 4);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (34, 'Matcha Latte Tây Bắc (Nóng)', 49000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/matcha_latte_tay_bac_nong_d591c8251dc64fb987118a408e861b09_grande.png', true, false, false, 4);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (35, 'Matcha Latte Kyoto', 55000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1745246722_matcha-latte_e183c01ed5844343882d089b37b6239f_grande.png', true, false, false, 5);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (36, 'Matcha Tây Bắc Trân Châu Hoàng Kim', 49000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1745246677_matcha-dao-copy_f96bb5d6b4ad4cf9a7a8a2006f1ad8c1_grande.png', true, false, false, 5);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (37, 'Trà Đào Cam Sả - Nóng', 59000.00, NULL, NULL, 'https://product.hstatic.net/1000075078/product/1737356382_oolong-tu-quy-sen-nong-copy_79b957510bcb4e6f8bb7d938f0448ab9_grande.png', true, false, false, 6);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (38, 'Trà Đào Cam Sả - Đá', 49000.00, NULL, NULL, 'https://product.hstatic.net/1000075078/product/1737356280_tra-dao-cam-sa_9c46cceef5004e689b746e8ec0e47c34_grande.png', true, false, false, 6);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (39, 'Trà Phúc Kiến Sen (Nóng)', 59000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/oolong_tu_quy_sen_nong_eb6f855cb05a423cbce31805f4a09dab_grande.png', true, false, false, 6);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (40, 'Trà Phúc Kiến Sen', 49000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/oolong_tu_quy_sen_da_45f85b5cedf64902b2a85fb969372d82_grande.png', true, false, false, 6);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (41, 'Trà Sữa Oolong Tứ Quý Sương Sáo', 55000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1751601456_tra-sua-oolong-tu-quy-suong-sao_c22c1bf76ba04c469c8d7f529c7d60f5_grande.png', true, false, false, 7);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (42, 'Trà Đen Macchiato', 55000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1751597791_tra-den-macchiato_7dceaebbb66f4cba8c92d7f6d713fa33_grande.png', true, false, false, 7);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (43, 'Chocolate Đá', 55000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/so_co_la_da_660ca0c6384b456b9eae735bfa9a9f2b_grande.png', true, false, false, 4);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (44, 'Chocolate Nóng', 55000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/so_co_la_nong_45c13bb985534867a7c0c8634e2f3349_grande.png', true, false, false, 4);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (45, 'Mochi Kem Trà Sữa Trân Châu', 19000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1737355411_mochi-tra-sua_bd68fdd9fe844f24b6d0fb772486263e_grande.png', true, false, false, 8);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (46, 'Mochi Kem Phúc Bồn Tử', 19000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1737355355_mochi-phuc-bon-tu_3a394194635c45a88a3d28969f2024c2_grande.png', true, false, false, 8);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (47, 'Mochi Kem Việt Quất', 19000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1737355361_mochi-viet-quat_c1acf906f8b94ff78fb197deefdd683d_grande.png', true, false, false, 8);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (48, 'Mochi Kem Chocolate', 19000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1737355348_mochi-choco_4a95ec58b13f410f884bee942ad49b51_grande.png', true, false, false, 8);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (49, 'Wafu Pasta Bò Bằm Xốt Bolognese', 59000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1742826512_wafu-pasta-bo-bam-xot-bolognese_a0019977ac644600a1b62916178d439c_grande.png', true, false, false, 9);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (50, 'Wafu Pasta Bò Karubi Xốt Miso Butter', 79000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1742826184_ba-chi-bo-xot-miso-butter-app_0cf77e7943dd4216aaa2957184f7a28a_grande.png', true, false, false, 9);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (51, 'Wafu Pasta Cá Bào Trứng Onsen Xốt Mentaiko', 69000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1742826409_wafu-pasta-ca-bao-trung-onsen-xot-mentaiko_6bd1486b8ca043b6b76dc8b10893ea93_grande.png', true, false, false, 10);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (52, 'Wafu Pasta Heo Nướng Xốt Shoyu Butter', 59000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1742826471_wafu-pasta-heo-nuong-xot-shoyu-butter_0a61c997465949488437957e9ee610e5_grande.png', true, false, false, 9);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (53, 'Pizza Hawaiian', 49000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1760452011_new-pizza-ham-dua_83eef655e1334756bf028fe216dbd596_grande.png', true, false, false, 10);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (54, 'Pizza New York 5 Cheese', 49000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1739269754_pizza-5cheese_39213eb56f6d4a1192b2001f06c37a5b_grande.png', true, false, false, 9);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (55, 'Pizza New York Bò Bằm Phô Mai', 49000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1739269763_pizza-sotbobam_c0b95e91c6154a9098f58b9e781266f9_grande.png', true, false, false, 9);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (56, 'Pizza New York Pepperoni', 49000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1739269747_pizza-pepperoni_01dd33aa54b7493aaa42b1048c089fbf_grande.png', true, false, false, 9);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (57, 'Pizza Tomyum Hải Sản', 59000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1772184957_pizza-tomyum-hai-san_c2577d8b603e49bbb8d8e91c0cf91025_grande.png', true, false, false, 10);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (58, 'Soft Pizza Chà Bông Trứng Cút', 39000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/1768278535_soft-pizza-cha-bong-trung-cut_13a79fcc3cc0452ea00217864e4b3549_grande.png', true, false, false, 11);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (59, 'Salad Cải Xoăn Xốt Yuzu', 49000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/salad_cai_xoan_xot_yuzu_cea0b33b62a841efbfe596069a89ae63_grande.png', true, false, false, 12);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (60, 'Salad Rau Rocket và Hạt', 49000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/nut_salad_630e8fb2fe8f448b8306dd8ffd1926a5_grande.png', true, false, false, 12);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (61, 'Túi Matcha Tốt', 169000.00, NULL, NULL, 'https://cdn.hstatic.net/products/1000075078/mer_29aa13aee84048dcb525b2f39efbb4af_grande.png', true, false, false, 13);
INSERT INTO menu_ci_local.san_pham (ma_san_pham, ten_san_pham, gia_ban, gia_niem_yet, mo_ta, hinh_anh_url, trang_thai, la_hot, la_moi, ma_danh_muc) VALUES (62, 'CI Americano', 55000.00, 65000.00, 'Created by CI test', 'https://example.com/ci-americano.png', false, true, false, 14);


--
-- Data for Name: articles; Type: TABLE DATA; Schema: news; Owner: admin
--

INSERT INTO news.articles (id, title, description, content, image_url, category, author_name, author_id, views, is_published, created_at, updated_at) VALUES ('fe650983-1b71-4a98-9c66-fa10ad3c8fce', 'Bắt gặp Sài Gòn xưa trong món uống hiện đại của giới trẻ', 'Dấu ấn Sài Gòn xưa được kể lại qua ly cà phê sữa đá và nhịp sống hiện đại.', 'Dấu ấn Sài Gòn xưa được kể lại qua ly cà phê sữa đá, không gian phố cũ và những thói quen rất riêng của người trẻ hôm nay. Hành trình vị giác bắt đầu từ chất liệu quen thuộc như cà phê rang đậm, sữa tươi và đá lạnh. Không chỉ là đồ uống, The Avengers House muốn tạo ra khoảnh khắc nghỉ chân nhẹ nhàng giữa ngày bận rộn.', 'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1600&q=80', 'COFFEEHOLIC', 'Editorial Team', NULL, 1, true, '2026-03-19 17:50:41.01993', '2026-03-20 18:48:59.836273');
INSERT INTO news.articles (id, title, description, content, image_url, category, author_name, author_id, views, is_published, created_at, updated_at) VALUES ('8847cc0f-ed7d-407d-9309-4e7ac44d2363', 'Trà trái cây và câu chuyện của những buổi chiều nhẹ tênh', 'Vị trà thanh, lớp trái cây mọng tạo nên một nhịp nghỉ vừa đủ trong ngày dài.', 'Trà ngon không chỉ nằm ở nguyên liệu mà còn ở nhiệt độ nước, thời gian ủ và tỉ lệ phối hương. Các dòng trà trái cây được phát triển theo hướng thanh, ít gắt và dễ uống hằng ngày. Lớp hương đầu tươi mát, hậu vị dịu giúp bạn cân bằng lại năng lượng sau những giờ làm việc liên tục.', 'https://images.unsplash.com/photo-1464306076886-da185f6a9d05?auto=format&fit=crop&w=1600&q=80', 'TEAHOLIC', 'Editorial Team', NULL, 1, true, '2026-03-19 17:50:41.01993', '2026-03-20 18:49:54.645678');
INSERT INTO news.articles (id, title, description, content, image_url, category, author_name, author_id, views, is_published, created_at, updated_at) VALUES ('67f0cf0b-f2c1-4ca8-967b-aad80d9938b7', 'Một ngày ở nhà rang xay: Hành trình từ hạt tới ly', 'Khám phá nhịp làm việc phía sau quầy bar, nơi từng mẻ rang được chỉnh sửa kỹ lưỡng.', 'Phía sau một ly nước ngon là cả chuỗi vận hành từ chọn hạt, bảo quản nguyên liệu, huấn luyện barista đến kiểm soát chất lượng theo từng khung giờ cao điểm. The Avengers House duy trì quy trình thử nếm định kỳ để bảo đảm các món chủ lực luôn ổn định giữa nhiều chi nhánh.', 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1600&q=80', 'BLOG', 'Store Operations', NULL, 1, true, '2026-03-19 17:50:41.01993', '2026-03-20 18:50:48.612634');
INSERT INTO news.articles (id, title, description, content, image_url, category, author_name, author_id, views, is_published, created_at, updated_at) VALUES ('12c7e2d3-31b4-4b79-8cf9-f99d29e349f2', 'UỐNG GÌ KHI TỚI SIGNATURE BY THE COFFEE HOUSE?', 'Vừa qua, The Coffee House chính thức khai trương cửa hàng SIGNATURE by The Coffee House, chuyên phục vụ cà phê đặc sản, các món ăn đa bản sắc ấy ý tưởng từ cà phê và trà và gây ấn tượng với không gian cảm hứng bài trí hành trình cà phê đặc sắc, làm nên một cuộc hẹn tròn đầy.', 'SIGNATURE by The Coffee House là mô hình khác biệt hoàn toàn với các cửa hàng cà phê khác trong chuỗi với định vị cao cấp và riêng biệt hơn. Theo đó, nơi đây được tạo ra để phục vụ bạn cả 3 nhu cầu về cà phê ngon – thức ăn ngon – không gian đầy cảm hứng ở cùng một địa điểm; cũng như đánh thức nguồn cảm hứng qua 5 giác quan: ngửi hương cà phê từ cửa – ngắm chuyện cà phê ở mỗi ngóc ngách – nghe những hạt cà phê reo trong hệ thống ống đồng, điểm xuyết trên nền nhạc chill – chạm hạt cà phê mới rang – nếm thử vị cà phê đặc sản Signature. Xem và nghe bản “hòa tấu” của những hạt cà phê trên nền nhạc trống jazz mỗi khi bắt đầu mẻ rang mới, bạn sẽ “giải mã” được trọn vẹn hành trình thú vị của hạt cà phê.', NULL, 'COFFEEHOLIC', 'Nhân viên', NULL, 1, true, '2026-03-20 18:52:35.30311', '2026-03-21 06:40:42.666063');


--
-- Data for Name: ca_doi_soat; Type: TABLE DATA; Schema: order_ci_1774020307401; Owner: admin
--



--
-- Data for Name: ca_lam_viec_nhan_vien; Type: TABLE DATA; Schema: order_ci_1774020307401; Owner: admin
--



--
-- Data for Name: chat_conversation; Type: TABLE DATA; Schema: order_ci_1774020307401; Owner: admin
--



--
-- Data for Name: chat_message; Type: TABLE DATA; Schema: order_ci_1774020307401; Owner: admin
--



--
-- Data for Name: chi_tiet_don_hang; Type: TABLE DATA; Schema: order_ci_1774020307401; Owner: admin
--



--
-- Data for Name: danh_gia_san_pham; Type: TABLE DATA; Schema: order_ci_1774020307401; Owner: admin
--



--
-- Data for Name: don_hang; Type: TABLE DATA; Schema: order_ci_1774020307401; Owner: admin
--



--
-- Data for Name: giao_dich_thanh_toan; Type: TABLE DATA; Schema: order_ci_1774020307401; Owner: admin
--



--
-- Data for Name: gio_hang; Type: TABLE DATA; Schema: order_ci_1774020307401; Owner: admin
--



--
-- Data for Name: thong_bao; Type: TABLE DATA; Schema: order_ci_1774020307401; Owner: admin
--



--
-- Data for Name: voucher; Type: TABLE DATA; Schema: order_ci_1774020307401; Owner: admin
--



--
-- Data for Name: yeu_thich_san_pham; Type: TABLE DATA; Schema: order_ci_1774020307401; Owner: admin
--



--
-- Data for Name: ca_doi_soat; Type: TABLE DATA; Schema: order_ci_1774020400837; Owner: admin
--



--
-- Data for Name: ca_lam_viec_nhan_vien; Type: TABLE DATA; Schema: order_ci_1774020400837; Owner: admin
--



--
-- Data for Name: chat_conversation; Type: TABLE DATA; Schema: order_ci_1774020400837; Owner: admin
--



--
-- Data for Name: chat_message; Type: TABLE DATA; Schema: order_ci_1774020400837; Owner: admin
--



--
-- Data for Name: chi_tiet_don_hang; Type: TABLE DATA; Schema: order_ci_1774020400837; Owner: admin
--



--
-- Data for Name: danh_gia_san_pham; Type: TABLE DATA; Schema: order_ci_1774020400837; Owner: admin
--



--
-- Data for Name: don_hang; Type: TABLE DATA; Schema: order_ci_1774020400837; Owner: admin
--



--
-- Data for Name: giao_dich_thanh_toan; Type: TABLE DATA; Schema: order_ci_1774020400837; Owner: admin
--



--
-- Data for Name: gio_hang; Type: TABLE DATA; Schema: order_ci_1774020400837; Owner: admin
--



--
-- Data for Name: thong_bao; Type: TABLE DATA; Schema: order_ci_1774020400837; Owner: admin
--



--
-- Data for Name: voucher; Type: TABLE DATA; Schema: order_ci_1774020400837; Owner: admin
--



--
-- Data for Name: yeu_thich_san_pham; Type: TABLE DATA; Schema: order_ci_1774020400837; Owner: admin
--



--
-- Data for Name: ca_doi_soat; Type: TABLE DATA; Schema: order_ci_1774020528986; Owner: admin
--



--
-- Data for Name: ca_lam_viec_nhan_vien; Type: TABLE DATA; Schema: order_ci_1774020528986; Owner: admin
--



--
-- Data for Name: chat_conversation; Type: TABLE DATA; Schema: order_ci_1774020528986; Owner: admin
--



--
-- Data for Name: chat_message; Type: TABLE DATA; Schema: order_ci_1774020528986; Owner: admin
--



--
-- Data for Name: chi_tiet_don_hang; Type: TABLE DATA; Schema: order_ci_1774020528986; Owner: admin
--



--
-- Data for Name: danh_gia_san_pham; Type: TABLE DATA; Schema: order_ci_1774020528986; Owner: admin
--



--
-- Data for Name: don_hang; Type: TABLE DATA; Schema: order_ci_1774020528986; Owner: admin
--



--
-- Data for Name: giao_dich_thanh_toan; Type: TABLE DATA; Schema: order_ci_1774020528986; Owner: admin
--



--
-- Data for Name: gio_hang; Type: TABLE DATA; Schema: order_ci_1774020528986; Owner: admin
--



--
-- Data for Name: thong_bao; Type: TABLE DATA; Schema: order_ci_1774020528986; Owner: admin
--



--
-- Data for Name: voucher; Type: TABLE DATA; Schema: order_ci_1774020528986; Owner: admin
--



--
-- Data for Name: yeu_thich_san_pham; Type: TABLE DATA; Schema: order_ci_1774020528986; Owner: admin
--



--
-- Data for Name: ca_doi_soat; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.ca_doi_soat (ma_ca, thoi_gian_bat_dau, thoi_gian_ket_thuc, tien_dau_ca, tien_cuoi_ca, tien_mat_he_thong, doanh_thu_he_thong, tien_mat_ky_vong, chenh_lech, tong_don, tong_don_tien_mat, ghi_chu, ten_nhan_vien, du_lieu_tom_tat, ngay_tao, trang_thai_phe_duyet, manager_duyet, ghi_chu_phe_duyet, thoi_gian_phe_duyet, co_so_ma) VALUES ('65c617ac-b90d-4560-bf4c-4469c7745156', '2026-03-13 00:00:00+00', '2026-03-13 16:37:37.02+00', 1000000.00, 1200000.00, 215000.00, 244000.00, 1215000.00, -15000.00, 6, 5, 'smoke test', 'automation', '{"non_cash_revenue": 29000}', '2026-03-13 16:37:37.136005', 'PENDING', NULL, NULL, NULL, 'MAC_DINH_CHI');
INSERT INTO orders.ca_doi_soat (ma_ca, thoi_gian_bat_dau, thoi_gian_ket_thuc, tien_dau_ca, tien_cuoi_ca, tien_mat_he_thong, doanh_thu_he_thong, tien_mat_ky_vong, chenh_lech, tong_don, tong_don_tien_mat, ghi_chu, ten_nhan_vien, du_lieu_tom_tat, ngay_tao, trang_thai_phe_duyet, manager_duyet, ghi_chu_phe_duyet, thoi_gian_phe_duyet, co_so_ma) VALUES ('4939bb26-6074-470b-b827-5f9029655574', '2026-03-12 17:00:00+00', '2026-03-13 16:38:36.936+00', 1000000.00, 3460000.00, 215000.00, 244000.00, 1215000.00, 2245000.00, 6, 5, NULL, 'thaian_admin', '{"non_cash_revenue": 29000}', '2026-03-13 16:50:45.68935', 'PENDING', NULL, NULL, NULL, 'MAC_DINH_CHI');
INSERT INTO orders.ca_doi_soat (ma_ca, thoi_gian_bat_dau, thoi_gian_ket_thuc, tien_dau_ca, tien_cuoi_ca, tien_mat_he_thong, doanh_thu_he_thong, tien_mat_ky_vong, chenh_lech, tong_don, tong_don_tien_mat, ghi_chu, ten_nhan_vien, du_lieu_tom_tat, ngay_tao, trang_thai_phe_duyet, manager_duyet, ghi_chu_phe_duyet, thoi_gian_phe_duyet, co_so_ma) VALUES ('eb2e08aa-40dd-4b9e-b31c-a7956e57d6fe', '2026-03-21 00:00:00+00', '2026-03-21 15:00:00+00', 1000000.00, 1241500.00, 241500.00, 241500.00, 1241500.00, 0.00, 4, 4, NULL, 'thaian_staff_thegracetower', '{"cash_net": 241500, "shift_date": "2026-03-21", "cash_in_gross": 241500, "online_revenue": 241500, "cash_change_out": 0, "in_store_revenue": 0, "non_cash_revenue": 0}', '2026-03-21 07:08:51.81846', 'APPROVED', 'thaian_manager_thegracetower', NULL, '2026-03-21 07:09:05.349+00', 'THE_GRACE_TOWER');
INSERT INTO orders.ca_doi_soat (ma_ca, thoi_gian_bat_dau, thoi_gian_ket_thuc, tien_dau_ca, tien_cuoi_ca, tien_mat_he_thong, doanh_thu_he_thong, tien_mat_ky_vong, chenh_lech, tong_don, tong_don_tien_mat, ghi_chu, ten_nhan_vien, du_lieu_tom_tat, ngay_tao, trang_thai_phe_duyet, manager_duyet, ghi_chu_phe_duyet, thoi_gian_phe_duyet, co_so_ma) VALUES ('1a6ea4a6-029e-4686-b1fa-4e6daad0066d', '2026-03-17 00:00:00+00', '2026-03-17 15:00:00+00', 1000000.00, 2159000.00, 1100000.00, 1100000.00, 2100000.00, 59000.00, 2, 2, NULL, 'thaian_staff_macdinhchi', '{"cash_net": 1100000, "shift_date": "2026-03-17", "cash_in_gross": 1121000, "online_revenue": 1071000, "cash_change_out": 21000, "in_store_revenue": 29000, "non_cash_revenue": 0}', '2026-03-17 03:13:15.879266', 'APPROVED', 'thaian_manager_macdinhchi', NULL, '2026-03-20 21:42:41.406+00', 'MAC_DINH_CHI');
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
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('f78b4c76-ef14-4584-befa-ed727e704cb6', 'thaian_staff_macdinhchi', 'Thai An Staff', '2026-03-19', 'SANG', 'Ca sang', '07:00', '12:00', 'ASSIGNED', NULL, NULL, 'Smoke request', NULL, '2026-03-17 18:26:44.275445', '2026-03-18 00:18:16.758718', 'MAC_DINH_CHI', 'STAFF_REQUEST', 'REJECTED', '2026-03-17 18:26:44.272+00', 'thaian_manager_macdinhchi', NULL, '2026-03-18 00:18:16.756+00');
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('37912c9c-f593-4066-9c78-af6d85352660', 'thaian_staff_macdinhchi', 'Thai An Staff', '2026-03-20', 'CHIEU', 'Ca chieu', '12:00', '17:00', 'ASSIGNED', NULL, NULL, 'Smoke request 2', NULL, '2026-03-17 18:27:07.780646', '2026-03-18 00:18:22.988924', 'MAC_DINH_CHI', 'STAFF_REQUEST', 'REJECTED', '2026-03-17 18:27:07.78+00', 'thaian_manager_macdinhchi', 'Smoke approved', '2026-03-18 00:18:22.986+00');
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('89320d21-cf73-43e5-a136-d264072f8484', 'thaian_staff_macdinhchi', 'thaian_staff_macdinhchi', '2026-03-18', 'SANG', 'Ca sang', '07:00', '12:00', 'ASSIGNED', NULL, NULL, NULL, NULL, '2026-03-18 02:12:05.729941', '2026-03-18 02:12:28.829246', 'MAC_DINH_CHI', 'STAFF_REQUEST', 'APPROVED', '2026-03-18 02:12:05.729+00', 'thaian_manager_macdinhchi', NULL, '2026-03-18 02:12:28.826+00');
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('40026abf-2aa8-4969-99b0-78983a75e8e3', 'thaian_staff_macdinhchi', 'thaian_staff_macdinhchi', '2026-03-18', 'CHIEU', 'Ca chieu', '12:00', '17:00', 'ASSIGNED', NULL, NULL, NULL, NULL, '2026-03-18 02:12:07.51847', '2026-03-18 02:12:30.1555', 'MAC_DINH_CHI', 'STAFF_REQUEST', 'APPROVED', '2026-03-18 02:12:07.518+00', 'thaian_manager_macdinhchi', NULL, '2026-03-18 02:12:30.145+00');
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('30b9e076-8725-42a0-84e0-3be0caddfab5', 'thaian_staff_macdinhchi', 'thaian_staff_macdinhchi', '2026-03-18', 'TOI', 'Ca toi', '17:00', '22:00', 'ASSIGNED', NULL, NULL, NULL, NULL, '2026-03-18 01:26:56.973108', '2026-03-18 02:11:44.131397', 'MAC_DINH_CHI', 'STAFF_REQUEST', 'REJECTED', '2026-03-18 01:26:56.964+00', 'thaian_manager_macdinhchi', NULL, '2026-03-18 02:11:44.127+00');
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('d5a74795-3790-4066-948c-b6ffbace4332', 'thaian_staff_macdinhchi', 'thaian_staff_macdinhchi', '2026-03-18', 'TOI', 'Ca toi', '17:00', '22:00', 'ASSIGNED', NULL, NULL, NULL, NULL, '2026-03-18 02:12:08.933086', '2026-03-18 02:12:31.497755', 'MAC_DINH_CHI', 'STAFF_REQUEST', 'APPROVED', '2026-03-18 02:12:08.932+00', 'thaian_manager_macdinhchi', NULL, '2026-03-18 02:12:31.495+00');
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('8f5274e6-ba32-42b4-a89c-b2fa16602bba', 'thaian_staff_macdinhchi', 'thaian_staff_macdinhchi', '2026-03-20', 'SANG', 'Ca sang', '07:00', '12:00', 'PRESENT', '2026-03-20 20:46:00+00', '2026-03-20 20:46:00+00', 'đi muộn', NULL, '2026-03-20 19:41:15.668043', '2026-03-20 20:46:57.704752', 'MAC_DINH_CHI', 'STAFF_REQUEST', 'APPROVED', '2026-03-20 19:41:15.666+00', 'thaian_manager_macdinhchi', NULL, '2026-03-20 19:49:59.956+00');
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('2e9c5d6c-c4f7-4898-85ee-1fa49f8412a4', 'thaian_staff_macdinhchi', 'thaian_staff_macdinhchi', '2026-03-20', 'CHIEU', 'Ca chieu', '12:00', '17:00', 'ASSIGNED', NULL, NULL, NULL, NULL, '2026-03-20 20:18:04.5684', '2026-03-20 20:18:28.208929', 'MAC_DINH_CHI', 'STAFF_REQUEST', 'APPROVED', '2026-03-20 20:18:04.567+00', 'thaian_manager_macdinhchi', NULL, '2026-03-20 20:18:28.205+00');
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('44150ac0-e0ef-4910-8199-7b62a6ef00f5', 'thaian_staff_macdinhchi', 'Thái An - Nhân viên cơ sở Mạc Đĩnh Chi', '2026-03-22', 'CHIEU', 'Ca chieu', '12:00', '17:00', 'ASSIGNED', NULL, NULL, NULL, 'thaian_manager_macdinhchi', '2026-03-20 20:18:43.796819', '2026-03-20 20:18:43.796819', 'MAC_DINH_CHI', 'MANAGER_ASSIGNMENT', 'APPROVED', '2026-03-20 20:18:43.794+00', 'thaian_manager_macdinhchi', NULL, '2026-03-20 20:18:43.794+00');
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('1749020c-e2bb-4201-b3cf-8893d0215418', 'thaian_staff_macdinhchi', 'Thái An - Nhân viên cơ sở Mạc Đĩnh Chi', '2026-03-22', 'TOI', 'Ca toi', '17:00', '22:00', 'ASSIGNED', NULL, NULL, NULL, 'thaian_manager_macdinhchi', '2026-03-20 20:18:43.796819', '2026-03-20 20:18:43.796819', 'MAC_DINH_CHI', 'MANAGER_ASSIGNMENT', 'APPROVED', '2026-03-20 20:18:43.796+00', 'thaian_manager_macdinhchi', NULL, '2026-03-20 20:18:43.796+00');
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('ef7ccf88-987b-480f-8a2d-89251bd00b74', 'thaian_staff_macdinhchi', 'Thái An - Nhân viên cơ sở Mạc Đĩnh Chi', '2026-03-22', 'SANG', 'Ca sang', '07:00', '12:00', 'PRESENT', '2026-03-20 20:45:00+00', NULL, NULL, 'thaian_manager_macdinhchi', '2026-03-20 20:18:43.796819', '2026-03-20 20:45:32.260555', 'MAC_DINH_CHI', 'MANAGER_ASSIGNMENT', 'APPROVED', '2026-03-20 20:18:43.792+00', 'thaian_manager_macdinhchi', NULL, '2026-03-20 20:18:43.792+00');
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('2170268b-9f34-4f2e-bce7-bada2e81b55f', 'thaian_staff_macdinhchi', 'thaian_staff_macdinhchi', '2026-03-20', 'TOI', 'Ca toi', '17:00', '22:00', 'ASSIGNED', NULL, NULL, NULL, NULL, '2026-03-20 20:48:23.070279', '2026-03-20 20:48:38.802633', 'MAC_DINH_CHI', 'STAFF_REQUEST', 'APPROVED', '2026-03-20 20:48:23.069+00', 'thaian_manager_macdinhchi', NULL, '2026-03-20 20:48:38.8+00');
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('0f99d4a0-a20b-4814-a6b6-56babc316957', 'thaian_staff_macdinhchi', 'thaian_staff_macdinhchi', '2026-03-21', 'SANG', 'Ca sang', '07:00', '12:00', 'LATE', '2026-03-21 07:05:00+00', '2026-03-21 07:05:00+00', 'nv di muon', NULL, '2026-03-21 07:04:26.846623', '2026-03-21 07:06:34.120759', 'MAC_DINH_CHI', 'STAFF_REQUEST', 'APPROVED', '2026-03-21 07:04:26.846+00', 'thaian_manager_macdinhchi', NULL, '2026-03-21 07:04:46.887+00');
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('495fe129-0877-44c2-a8d1-909ee29a53d1', 'thaian_manager_macdinhchi', 'Thái An - Quản lý cơ sở Mạc Đĩnh Chi', '2026-03-21', 'SANG', 'Ca sang', '07:00', '12:00', 'ASSIGNED', NULL, NULL, NULL, 'thaian_manager_macdinhchi', '2026-03-21 07:06:01.786558', '2026-03-21 07:06:01.786558', 'MAC_DINH_CHI', 'MANAGER_ASSIGNMENT', 'APPROVED', '2026-03-21 07:06:01.784+00', 'thaian_manager_macdinhchi', NULL, '2026-03-21 07:06:01.784+00');
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('a3f97741-d503-4c39-8341-1744131d156f', 'thaian_manager_macdinhchi', 'Thái An - Quản lý cơ sở Mạc Đĩnh Chi', '2026-03-21', 'CHIEU', 'Ca chieu', '12:00', '17:00', 'ASSIGNED', NULL, NULL, NULL, 'thaian_manager_macdinhchi', '2026-03-21 07:06:01.786558', '2026-03-21 07:06:01.786558', 'MAC_DINH_CHI', 'MANAGER_ASSIGNMENT', 'APPROVED', '2026-03-21 07:06:01.785+00', 'thaian_manager_macdinhchi', NULL, '2026-03-21 07:06:01.785+00');
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('8a456f70-37bf-4ccb-9d71-1c6e36dae2b3', 'thaian_manager_macdinhchi', 'Thái An - Quản lý cơ sở Mạc Đĩnh Chi', '2026-03-21', 'TOI', 'Ca toi', '17:00', '22:00', 'ASSIGNED', NULL, NULL, NULL, 'thaian_manager_macdinhchi', '2026-03-21 07:06:01.786558', '2026-03-21 07:06:01.786558', 'MAC_DINH_CHI', 'MANAGER_ASSIGNMENT', 'APPROVED', '2026-03-21 07:06:01.786+00', 'thaian_manager_macdinhchi', NULL, '2026-03-21 07:06:01.786+00');
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('24d196d0-a4c8-41b5-b3b7-2fec6f014d7f', 'thaian_staff_macdinhchi', 'Thái An - Nhân viên cơ sở Mạc Đĩnh Chi', '2026-03-21', 'CHIEU', 'Ca chieu', '12:00', '17:00', 'ASSIGNED', NULL, NULL, NULL, 'thaian_manager_macdinhchi', '2026-03-21 07:06:09.615737', '2026-03-21 07:06:09.615737', 'MAC_DINH_CHI', 'MANAGER_ASSIGNMENT', 'APPROVED', '2026-03-21 07:06:09.614+00', 'thaian_manager_macdinhchi', NULL, '2026-03-21 07:06:09.614+00');
INSERT INTO orders.ca_lam_viec_nhan_vien (ma_ca_lam_viec, staff_username, staff_name, ngay_lam_viec, ma_khung_ca, ten_ca, gio_bat_dau, gio_ket_thuc, trang_thai_cham_cong, check_in_at, check_out_at, note, manager_username, ngay_tao, ngay_cap_nhat, co_so_ma, nguon_tao, trang_thai_yeu_cau, thoi_gian_gui_yeu_cau, nguoi_duyet_yeu_cau, ghi_chu_duyet, thoi_gian_duyet) VALUES ('b0021831-2d37-4330-894b-0eddc1d13bda', 'thaian_staff_macdinhchi', 'Thái An - Nhân viên cơ sở Mạc Đĩnh Chi', '2026-03-21', 'TOI', 'Ca toi', '17:00', '22:00', 'ASSIGNED', NULL, NULL, NULL, 'thaian_manager_macdinhchi', '2026-03-21 07:06:09.615737', '2026-03-21 07:06:09.615737', 'MAC_DINH_CHI', 'MANAGER_ASSIGNMENT', 'APPROVED', '2026-03-21 07:06:09.615+00', 'thaian_manager_macdinhchi', NULL, '2026-03-21 07:06:09.615+00');


--
-- Data for Name: chat_conversation; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.chat_conversation (ma_hoi_thoai, ma_khach_hang, ten_khach_hang, ma_nhan_su_phu_trach, ten_nhan_su_phu_trach, vai_tro_nhan_su_phu_trach, trang_thai, tin_nhan_cuoi, vai_tro_nguoi_gui_cuoi, so_tin_nhan_chua_doc_khach, so_tin_nhan_chua_doc_nhan_su, ngay_tao, ngay_cap_nhat) VALUES ('78ea845a-915b-4395-b082-c95a208b77cd', 'guest-chat-1773975150323-9d17ce36', 'Khách', NULL, NULL, NULL, 'OPEN', 'xin chào', 'CUSTOMER', 0, 0, '2026-03-20 02:52:56.669393', '2026-03-20 02:53:11.743628');
INSERT INTO orders.chat_conversation (ma_hoi_thoai, ma_khach_hang, ten_khach_hang, ma_nhan_su_phu_trach, ten_nhan_su_phu_trach, vai_tro_nhan_su_phu_trach, trang_thai, tin_nhan_cuoi, vai_tro_nguoi_gui_cuoi, so_tin_nhan_chua_doc_khach, so_tin_nhan_chua_doc_nhan_su, ngay_tao, ngay_cap_nhat) VALUES ('139e9f0e-e550-40a0-9d68-8279389f4817', 'guest-chat-1774027924296-14741fd9', 'Khách', '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'thaian_staff_macdinhchi', 'STAFF', 'OPEN', 'hi', 'STAFF', 5, 0, '2026-03-20 18:02:46.370624', '2026-03-20 18:28:31.261832');
INSERT INTO orders.chat_conversation (ma_hoi_thoai, ma_khach_hang, ten_khach_hang, ma_nhan_su_phu_trach, ten_nhan_su_phu_trach, vai_tro_nhan_su_phu_trach, trang_thai, tin_nhan_cuoi, vai_tro_nguoi_gui_cuoi, so_tin_nhan_chua_doc_khach, so_tin_nhan_chua_doc_nhan_su, ngay_tao, ngay_cap_nhat) VALUES ('1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hi', '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'thaian_staff_macdinhchi', 'STAFF', 'OPEN', 'hô', 'STAFF', 4, 0, '2026-03-14 02:30:55.460023', '2026-03-20 18:28:52.761986');
INSERT INTO orders.chat_conversation (ma_hoi_thoai, ma_khach_hang, ten_khach_hang, ma_nhan_su_phu_trach, ten_nhan_su_phu_trach, vai_tro_nhan_su_phu_trach, trang_thai, tin_nhan_cuoi, vai_tro_nguoi_gui_cuoi, so_tin_nhan_chua_doc_khach, so_tin_nhan_chua_doc_nhan_su, ngay_tao, ngay_cap_nhat) VALUES ('0cefb3ca-4c9f-4705-9670-95d715733d96', 'guest-chat-1774074944221-732f8d19', 'Khách', '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'thaian_staff_macdinhchi', 'STAFF', 'OPEN', 'hello', 'STAFF', 1, 0, '2026-03-21 06:41:20.125317', '2026-03-21 06:41:48.728338');
INSERT INTO orders.chat_conversation (ma_hoi_thoai, ma_khach_hang, ten_khach_hang, ma_nhan_su_phu_trach, ten_nhan_su_phu_trach, vai_tro_nhan_su_phu_trach, trang_thai, tin_nhan_cuoi, vai_tro_nguoi_gui_cuoi, so_tin_nhan_chua_doc_khach, so_tin_nhan_chua_doc_nhan_su, ngay_tao, ngay_cap_nhat) VALUES ('7254c06f-e4d3-466e-b0c6-2fce947fdf22', 'e504a017-0ac3-4f82-b2c4-f6cb052b7bb2', 'an nguyễn thái', NULL, NULL, NULL, 'OPEN', NULL, NULL, 0, 0, '2026-03-19 16:14:09.207983', '2026-03-19 16:14:09.207983');


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
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (13, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hello', 'CUSTOMER', 'hi', '2026-03-18 00:49:26.632797');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (14, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'thaian_staff_macdinhchi', 'STAFF', 'hi', '2026-03-18 00:49:32.497553');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (15, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hello', 'CUSTOMER', 'ho', '2026-03-18 02:29:49.866543');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (16, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hello', 'CUSTOMER', 'hi', '2026-03-18 02:29:57.506512');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (17, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', '03f1a264-f077-44b4-96da-9de76cc75989', 'thaian_manager_macdinhchi', 'MANAGER', 'hi', '2026-03-18 02:30:38.007554');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (18, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hello', 'CUSTOMER', 'hi', '2026-03-18 02:31:10.536249');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (19, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', '03f1a264-f077-44b4-96da-9de76cc75989', 'thaian_manager_macdinhchi', 'MANAGER', 'chào bạn nhé', '2026-03-18 02:31:14.949289');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (20, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hello', 'CUSTOMER', 'oke', '2026-03-18 02:37:57.980805');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (21, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', '03f1a264-f077-44b4-96da-9de76cc75989', 'thaian_manager_macdinhchi', 'MANAGER', 'hello', '2026-03-18 02:38:02.707713');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (22, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hello', 'CUSTOMER', 'hi', '2026-03-19 16:48:45.842741');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (23, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', '03f1a264-f077-44b4-96da-9de76cc75989', 'thaian_manager_macdinhchi', 'MANAGER', 'hi', '2026-03-19 16:49:00.371614');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (24, '78ea845a-915b-4395-b082-c95a208b77cd', 'guest-chat-1773975150323-9d17ce36', 'Khách', 'CUSTOMER', 'xin chào', '2026-03-20 02:52:59.412367');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (25, '139e9f0e-e550-40a0-9d68-8279389f4817', 'guest-chat-1774027924296-14741fd9', 'Khách', 'CUSTOMER', 'hi', '2026-03-20 18:02:51.158167');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (26, '139e9f0e-e550-40a0-9d68-8279389f4817', '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'thaian_staff_macdinhchi', 'STAFF', 'hi', '2026-03-20 18:03:08.94512');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (27, '139e9f0e-e550-40a0-9d68-8279389f4817', '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'thaian_staff_macdinhchi', 'STAFF', 'chào bạn', '2026-03-20 18:03:17.52122');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (28, '139e9f0e-e550-40a0-9d68-8279389f4817', '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'thaian_staff_macdinhchi', 'STAFF', 'dạ', '2026-03-20 18:03:32.035171');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (29, '139e9f0e-e550-40a0-9d68-8279389f4817', 'guest-chat-1774027924296-14741fd9', 'Khách', 'CUSTOMER', 'hi', '2026-03-20 18:11:33.750862');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (30, '139e9f0e-e550-40a0-9d68-8279389f4817', '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'thaian_staff_macdinhchi', 'STAFF', 'hi', '2026-03-20 18:11:45.330505');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (31, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hello hehe', 'CUSTOMER', 'hi', '2026-03-20 18:12:08.246473');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (32, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'thaian_staff_macdinhchi', 'STAFF', 'hi', '2026-03-20 18:12:15.438955');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (33, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hello hehe', 'CUSTOMER', 'hi', '2026-03-20 18:12:18.433579');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (34, '139e9f0e-e550-40a0-9d68-8279389f4817', 'guest-chat-1774027924296-14741fd9', 'Khách', 'CUSTOMER', 'hi', '2026-03-20 18:28:25.656213');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (35, '139e9f0e-e550-40a0-9d68-8279389f4817', '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'thaian_staff_macdinhchi', 'STAFF', 'hi', '2026-03-20 18:28:31.266488');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (36, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', 'b81d9738-535e-4475-884d-aeb3b7324f01', 'thái an hello hehe', 'CUSTOMER', 'haii', '2026-03-20 18:28:46.441628');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (37, '1c7e31b5-bda7-4435-be7c-dcb95b60fbb8', '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'thaian_staff_macdinhchi', 'STAFF', 'hô', '2026-03-20 18:28:52.764857');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (38, '0cefb3ca-4c9f-4705-9670-95d715733d96', 'guest-chat-1774074944221-732f8d19', 'Khách', 'CUSTOMER', 'hi', '2026-03-21 06:41:43.582116');
INSERT INTO orders.chat_message (id, ma_hoi_thoai, ma_nguoi_gui, ten_nguoi_gui, vai_tro_nguoi_gui, noi_dung, ngay_tao) VALUES (39, '0cefb3ca-4c9f-4705-9670-95d715733d96', '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'thaian_staff_macdinhchi', 'STAFF', 'hello', '2026-03-21 06:41:48.73555');


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
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (84, 'ae91e627-cadc-4fc9-b6e9-a74065d27ba0', 1, 'Cà Phê Sữa Đá', 29000.00, 1, 'Nhỏ', '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (85, '7266c327-5e7c-4bc8-af73-21ecbcd26be2', 1, 'Cà Phê Sữa Đá', 29000.00, 1, 'Nhỏ', '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (86, '77115a2e-4900-4d7a-85e7-4b5d16d4117b', 1, 'Cà Phê Sữa Đá', 29000.00, 1, 'Nhỏ', '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (87, '0d9482fe-3404-41bc-aa32-350de0752bb7', 3, 'Pizza 5 Cheese', 39000.00, 1, 'Nhỏ', '/images/products/pizza-5-cheese.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (88, 'b47e798e-eb77-4489-bc7e-ee0a98328645', 1, 'Cà Phê Sữa Đá', 29000.00, 1, 'Nhỏ', '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (89, 'c29e7dfa-395d-4407-9d4c-fa549758ca83', 1, 'Cà Phê Sữa Đá', 29000.00, 1, 'Nhỏ', '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (90, '601424b1-e745-45e3-a34e-4023d1d7832a', 1, 'Cà Phê Sữa Đá', 29000.00, 1, 'Nhỏ', '/images/products/ca-phe-sua-da.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (91, 'b9eb52cf-4f85-4ad1-b4ff-fb3b285e8fbf', 1, 'Cà Phê Sữa Đá', 39000.00, 1, 'Nhỏ', 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_da_73fed306bafb4f87b4cb44573c900388_grande.png');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (92, 'bb4f518c-a8a4-427c-bd8b-a879b4cb0df9', 2, 'Trà Đào Cam Sả', 45000.00, 1, 'Nhỏ', '/images/products/tra-dao-cam-sa.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (93, 'bb4f518c-a8a4-427c-bd8b-a879b4cb0df9', 1, 'Cà Phê Sữa Đá', 39000.00, 2, 'Nhỏ', 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_da_73fed306bafb4f87b4cb44573c900388_grande.png');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (94, 'd6172352-2ceb-4f75-8bc1-8366b9b78ed1', 2, 'Trà Đào Cam Sả', 45000.00, 2, 'Nhỏ', '/images/products/tra-dao-cam-sa.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (95, 'afc08d85-f1bb-4e77-a5eb-0c6ad9cd28c9', 1, 'Cà Phê Sữa Đá', 39000.00, 1, 'Nhỏ', 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_da_73fed306bafb4f87b4cb44573c900388_grande.png');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (96, '44174905-2603-4a1b-a387-02537473830f', 1, 'Cà Phê Sữa Đá', 45000.00, 1, 'Vừa', 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_da_73fed306bafb4f87b4cb44573c900388_grande.png');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (98, '21a4103b-2054-4d3a-815d-70865c74d5cc', 11, 'Latte Nóng', 59000.00, 1, NULL, NULL);
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (99, 'ff995088-9792-4c84-862b-5b5488e34a54', 11, 'Latte Nóng', 59000.00, 1, NULL, NULL);
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (100, 'a79d81c8-2add-4893-97cc-8f346393176e', 2, 'Trà Đào Cam Sả', 45000.00, 1, 'Nhỏ', '/images/products/tra-dao-cam-sa.jpg');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (101, 'ec39cbb2-7ff1-4960-9114-a3ba73364535', 1, 'Cà Phê Sữa Đá', 39000.00, 1, 'Nhỏ', 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_da_73fed306bafb4f87b4cb44573c900388_grande.png');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (103, '3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb', 1, 'Cà Phê Sữa Đá', 39000.00, 2, 'Vừa', 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_da_73fed306bafb4f87b4cb44573c900388_grande.png');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (104, 'b7df122e-d73a-45fa-abc5-f03e44c12c90', 1, 'Cà Phê Sữa Đá', 39000.00, 1, 'Nhỏ', 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_da_73fed306bafb4f87b4cb44573c900388_grande.png');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (105, 'd8b32f5f-d817-4640-8fc7-6837da6726fc', 1, 'Cà Phê Sữa Đá', 39000.00, 1, 'Nhỏ', 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_da_73fed306bafb4f87b4cb44573c900388_grande.png');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (106, '7a66ed6d-1ea2-4a43-8c57-2b08df22f292', 1, 'Cà Phê Sữa Đá', 39000.00, 1, 'Nhỏ', 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_da_73fed306bafb4f87b4cb44573c900388_grande.png');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (107, 'e20dc8d4-4796-4e23-b881-ea20cca1b45b', 1, 'Cà Phê Sữa Đá', 39000.00, 1, 'Nhỏ', 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_da_73fed306bafb4f87b4cb44573c900388_grande.png');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (108, 'a317ce7a-0c16-468c-86be-f6816354ee9b', 1, 'Cà Phê Sữa Đá', 39000.00, 1, NULL, NULL);
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (109, '61628d99-846e-4982-b12d-47c399e2695a', 1, 'Cà Phê Sữa Đá', 39000.00, 1, NULL, NULL);
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (110, '5a69eceb-db45-4226-a6ad-3e5b820867e8', 1, 'Cà Phê Sữa Đá', 39000.00, 3, 'Nhỏ', 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_da_73fed306bafb4f87b4cb44573c900388_grande.png');
INSERT INTO orders.chi_tiet_don_hang (id, ma_don_hang, ma_san_pham, ten_san_pham, gia_ban, so_luong, kich_co, hinh_anh_url) VALUES (111, '8066d8e3-a14c-4f78-a912-491fb2b9828f', 18, 'A-Mê Yuzu', 49000.00, 52, 'Nhỏ', 'https://cdn.hstatic.net/products/1000075078/americano_thanh_yen_35e4c9612d944fab83c2a386f8d72cab_grande.png');


--
-- Data for Name: danh_gia_san_pham; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.danh_gia_san_pham (id, ma_san_pham, ma_nguoi_dung, so_sao, binh_luan, ma_don_hang, ngay_tao, ngay_cap_nhat, phan_hoi_quan_ly, nguoi_phan_hoi, thoi_gian_phan_hoi) VALUES (1, '00000000-0000-0000-0000-000000000001', 'b81d9738-535e-4475-884d-aeb3b7324f01', 4, 'Test qua gateway ok', NULL, '2026-03-12 15:49:20.189312', '2026-03-12 16:05:55.724029', NULL, NULL, NULL);
INSERT INTO orders.danh_gia_san_pham (id, ma_san_pham, ma_nguoi_dung, so_sao, binh_luan, ma_don_hang, ngay_tao, ngay_cap_nhat, phan_hoi_quan_ly, nguoi_phan_hoi, thoi_gian_phan_hoi) VALUES (3, '1', '27fbca00-a226-4d07-b331-e3c34cd0f63c', 5, 'ok', '0be27c43-8933-45bc-8ef9-b4d6856098cc', '2026-03-13 12:06:17.306794', '2026-03-13 12:06:17.306794', NULL, NULL, NULL);
INSERT INTO orders.danh_gia_san_pham (id, ma_san_pham, ma_nguoi_dung, so_sao, binh_luan, ma_don_hang, ngay_tao, ngay_cap_nhat, phan_hoi_quan_ly, nguoi_phan_hoi, thoi_gian_phan_hoi) VALUES (2, '1', 'b81d9738-535e-4475-884d-aeb3b7324f01', 4, 'rất ngon', 'cb628904-5a9d-4fa7-8cea-4f7848af65fb', '2026-03-12 16:23:04.868871', '2026-03-17 13:23:41.083457', NULL, NULL, NULL);
INSERT INTO orders.danh_gia_san_pham (id, ma_san_pham, ma_nguoi_dung, so_sao, binh_luan, ma_don_hang, ngay_tao, ngay_cap_nhat, phan_hoi_quan_ly, nguoi_phan_hoi, thoi_gian_phan_hoi) VALUES (5, '1', 'b81d9738-535e-4475-884d-aeb3b7324f01', 5, 'rất ngon', '601424b1-e745-45e3-a34e-4023d1d7832a', '2026-03-20 03:45:03.029046', '2026-03-20 03:45:03.029046', NULL, NULL, NULL);
INSERT INTO orders.danh_gia_san_pham (id, ma_san_pham, ma_nguoi_dung, so_sao, binh_luan, ma_don_hang, ngay_tao, ngay_cap_nhat, phan_hoi_quan_ly, nguoi_phan_hoi, thoi_gian_phan_hoi) VALUES (4, '1', 'b81d9738-535e-4475-884d-aeb3b7324f01', 5, 'rất oke nhé', '9f80309f-0c7e-45ed-8e14-86528fc13474', '2026-03-17 13:46:47.331057', '2026-03-20 21:24:27.236337', 'Cam on ban, quan se cai thien chat luong.', 'thaian_manager_macdinhchi', '2026-03-20 21:24:27.234+00');
INSERT INTO orders.danh_gia_san_pham (id, ma_san_pham, ma_nguoi_dung, so_sao, binh_luan, ma_don_hang, ngay_tao, ngay_cap_nhat, phan_hoi_quan_ly, nguoi_phan_hoi, thoi_gian_phan_hoi) VALUES (6, '1', 'b81d9738-535e-4475-884d-aeb3b7324f01', 5, 'hig', 'bb4f518c-a8a4-427c-bd8b-a879b4cb0df9', '2026-03-20 18:37:52.582631', '2026-03-20 21:25:32.797787', NULL, NULL, NULL);
INSERT INTO orders.danh_gia_san_pham (id, ma_san_pham, ma_nguoi_dung, so_sao, binh_luan, ma_don_hang, ngay_tao, ngay_cap_nhat, phan_hoi_quan_ly, nguoi_phan_hoi, thoi_gian_phan_hoi) VALUES (7, '1', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 5, 'ngon lắm
', 'ec39cbb2-7ff1-4960-9114-a3ba73364535', '2026-03-21 06:58:07.255847', '2026-03-21 07:10:02.474275', NULL, NULL, NULL);


--
-- Data for Name: don_hang; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('0af2977d-023b-4b1a-9e47-f2debd1c7ce1', 'guest-debug-qr', 25000.00, '57 Nguyen Du, Phuong Ben Nghe, Quan 1, Thanh pho Ho Chi Minh', '18:00 - 19:00', 'debug qr', 'NGAN_HANG_QR', 'CHO_XU_LY', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-17T18:00:56.686Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-17T18:00:56.686Z", "trang_thai": "CHO_XU_LY"}]', '2026-03-17 18:00:56.701573', '2026-03-17 18:00:56.701573', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('ae91e627-cadc-4fc9-b6e9-a74065d27ba0', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, '28 Ter B Mạc Đĩnh Chi, Phường Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'CHO_XU_LY', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-17T23:34:05.089Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-17T23:34:05.089Z", "trang_thai": "CHO_XU_LY"}]', '2026-03-17 23:34:05.099689', '2026-03-17 23:34:05.099689', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('b47e798e-eb77-4489-bc7e-ee0a98328645', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, '28 Ter B Mạc Đĩnh Chi, Phường Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'CHO_XU_LY', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-18T02:14:38.822Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-18T02:14:38.822Z", "trang_thai": "CHO_XU_LY"}]', '2026-03-18 02:14:38.829468', '2026-03-18 02:14:38.829468', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('b7df122e-d73a-45fa-abc5-f03e44c12c90', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 39000.00, 'Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'DA_THANH_TOAN', 'DA_XAC_NHAN', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-21T06:50:54.855Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-21T06:50:54.855Z", "trang_thai": "CHO_XU_LY"}, {"loai": "ORDER", "ghi_chu": "Nhan thanh toan QR thanh cong", "thoi_gian": "2026-03-21T06:51:24.681Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "PAYMENT", "ghi_chu": "Nhan thanh toan QR thanh cong", "thoi_gian": "2026-03-21T06:51:24.681Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-21 06:50:54.860603', '2026-03-21 06:51:24.683924', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('601424b1-e745-45e3-a34e-4023d1d7832a', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, '28 Ter B Mạc Đĩnh Chi, Phường Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-20T03:44:13.364Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-20T03:44:13.364Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T03:44:44.449Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T03:44:44.526Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T03:44:44.600Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T03:44:44.675Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T03:44:44.675Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-20 03:44:13.384019', '2026-03-20 03:44:44.671128', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', 29000.00, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('d6172352-2ceb-4f75-8bc1-8366b9b78ed1', 'b81d9738-535e-4475-884d-aeb3b7324f01', 90000.00, '28 Ter B Mạc Đĩnh Chi, Phường Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'gegeg', 'THANH_TOAN_KHI_NHAN_HANG', 'THAT_BAI', 'DA_HUY', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-20T18:31:44.959Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-20T18:31:44.959Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "ban", "thoi_gian": "2026-03-20T18:31:56.730Z", "trang_thai": "DA_HUY"}, {"loai": "PAYMENT", "ghi_chu": "ban", "thoi_gian": "2026-03-20T18:31:56.730Z", "trang_thai": "THAT_BAI"}]', '2026-03-20 18:31:44.965531', '2026-03-20 18:31:56.734209', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('a317ce7a-0c16-468c-86be-f6816354ee9b', 'guest-pos-1774076408806', 39000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'DANG_CHUAN_BI', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-21T07:00:08.821Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-21T07:00:08.821Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-21T07:00:10.778Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-21T07:00:10.815Z", "trang_thai": "DANG_CHUAN_BI"}]', '2026-03-21 07:00:08.820833', '2026-03-21 07:00:10.811667', 'TAI_CHO', NULL, NULL, 'thaian_staff_macdinhchi', 'MAC_DINH_CHI', 55000.00, 16000.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('5a69eceb-db45-4226-a6ad-3e5b820867e8', 'f8535c0c-4f47-483e-b7b3-f63c563af1cc', 117000.00, 'Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-21T07:22:01.816Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-21T07:22:01.816Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}]', '2026-03-21 07:22:01.819238', '2026-03-21 07:22:01.819238', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('8066d8e3-a14c-4f78-a912-491fb2b9828f', 'f8535c0c-4f47-483e-b7b3-f63c563af1cc', 2548000.00, 'Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-21T07:22:45.150Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-21T07:22:45.150Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}]', '2026-03-21 07:22:45.155495', '2026-03-21 07:22:45.155495', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('7266c327-5e7c-4bc8-af73-21ecbcd26be2', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, '28 Ter B Mạc Đĩnh Chi, Phường Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'DA_THANH_TOAN', 'DA_XAC_NHAN', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-18T00:22:56.039Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-18T00:22:56.039Z", "trang_thai": "CHO_XU_LY"}, {"loai": "ORDER", "ghi_chu": "Nhan thanh toan QR thanh cong", "thoi_gian": "2026-03-18T00:23:27.913Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "PAYMENT", "ghi_chu": "Nhan thanh toan QR thanh cong", "thoi_gian": "2026-03-18T00:23:27.913Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-18 00:22:56.055256', '2026-03-18 00:23:27.916418', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('c29e7dfa-395d-4407-9d4c-fa549758ca83', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, '28 Ter B Mạc Đĩnh Chi, Phường Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'DA_THANH_TOAN', 'DA_XAC_NHAN', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-18T02:16:36.430Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-18T02:16:36.430Z", "trang_thai": "CHO_XU_LY"}, {"loai": "ORDER", "ghi_chu": "Nhan thanh toan QR thanh cong", "thoi_gian": "2026-03-18T02:16:50.390Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "PAYMENT", "ghi_chu": "Nhan thanh toan QR thanh cong", "thoi_gian": "2026-03-18T02:16:50.390Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-18 02:16:36.432637', '2026-03-18 02:16:50.393333', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('2ff31732-491d-46ad-af06-5948e1a51387', 'b81d9738-535e-4475-884d-aeb3b7324f01', 58000.00, 'KTX Khu A, Dai hoc Cong nghe Moi a', '18:00 - 19:00', 'test', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-13T11:59:57.327Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-13T11:59:57.327Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}]', '2026-03-13 11:59:57.331911', '2026-03-13 11:59:57.331911', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('0be27c43-8933-45bc-8ef9-b4d6856098cc', '27fbca00-a226-4d07-b331-e3c34cd0f63c', 29000.00, 'KTX Khu A, Dai hoc Cong nghe Moi', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-13T12:06:06.655Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-13T12:06:06.655Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}]', '2026-03-13 12:06:06.658685', '2026-03-13 12:06:06.658685', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('5e3b0e5f-7b69-4e01-8732-d940f6823310', 'guest-debug-qr2', 25000.00, '57 Nguyen Du, Quan 1, Thanh pho Ho Chi Minh', '18:00 - 19:00', 'debug qr fallback', 'NGAN_HANG_QR', 'CHO_XU_LY', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-17T18:15:43.102Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-17T18:15:43.102Z", "trang_thai": "CHO_XU_LY"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T23:46:40.142Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T23:46:40.224Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T23:46:40.254Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T23:46:40.291Z", "trang_thai": "HOAN_THANH"}]', '2026-03-17 18:15:43.106631', '2026-03-17 23:46:40.29003', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('578b04ff-1b70-457b-8909-778f2c44fd79', 'guest-pos-1773511429181', 45000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-14T18:03:49.195Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-14T18:03:49.195Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:08:53.445Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:08:56.826Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:08:56.861Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:08:56.895Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:08:56.895Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-14 18:03:49.193729', '2026-03-14 18:08:56.893158', 'TAI_CHO', NULL, NULL, 'thaian_staff_thegracetower', 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('64cf42ee-0ff8-485c-bacc-681c4f9b314a', 'guest-pos-1773512655214', 45000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-14T18:24:15.229Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-14T18:24:15.229Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:24:19.091Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:24:19.146Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:24:19.183Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:24:19.218Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:24:19.218Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-14 18:24:15.228354', '2026-03-14 18:24:19.216764', 'TAI_CHO', NULL, NULL, 'thaian_staff_thegracetower', 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('afc08d85-f1bb-4e77-a5eb-0c6ad9cd28c9', 'b81d9738-535e-4475-884d-aeb3b7324f01', 39000.00, '28 Ter B Mạc Đĩnh Chi, Phường Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'DA_THANH_TOAN', 'DA_XAC_NHAN', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-20T18:35:53.981Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-20T18:35:53.981Z", "trang_thai": "CHO_XU_LY"}, {"loai": "ORDER", "ghi_chu": "Nhan thanh toan QR thanh cong", "thoi_gian": "2026-03-20T18:36:22.508Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "PAYMENT", "ghi_chu": "Nhan thanh toan QR thanh cong", "thoi_gian": "2026-03-20T18:36:22.508Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-20 18:35:53.994013', '2026-03-20 18:36:22.50984', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('d8b32f5f-d817-4640-8fc7-6837da6726fc', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 39000.00, 'Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'CHO_XU_LY', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-21T06:52:02.351Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-21T06:52:02.351Z", "trang_thai": "CHO_XU_LY"}]', '2026-03-21 06:52:02.354912', '2026-03-21 06:52:02.354912', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('6dcb1d79-4a3c-42b4-94b2-eee97df7de78', 'b81d9738-535e-4475-884d-aeb3b7324f01', 70000.00, 'KTX Khu A, Dai hoc Cong nghe Moi aaaa', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'DA_XAC_NHAN', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-13T14:13:54.761Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-13T14:13:54.762Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-13T15:13:47.017Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-13T15:13:48.340Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-13T15:13:51.804Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-13T15:13:54.207Z", "trang_thai": "HOAN_THANH"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-13T15:14:07.657Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-13T15:14:25.793Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-13T15:29:23.685Z", "trang_thai": "DA_XAC_NHAN"}]', '2026-03-13 14:13:54.766014', '2026-03-13 15:29:23.714124', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('e17672c1-948c-4400-8fe2-ed45f9d74f8a', 'guest-pos-1773416546036', 29000.00, 'Mang di tai quay', NULL, 'test pos', 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'DA_XAC_NHAN', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-13T15:42:26.036Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-13T15:42:26.036Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-13 15:42:26.056556', '2026-03-13 15:42:26.056556', 'MANG_DI', NULL, 'Khach Test', 'admin_test', 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('19c8545d-ab54-49d1-a21b-93ca1f2170b9', 'guest-pos-1773416836494', 29000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'DA_XAC_NHAN', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-13T15:47:16.495Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-13T15:47:16.495Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-13 15:47:16.51746', '2026-03-13 15:47:16.51746', 'TAI_CHO', NULL, NULL, 'thaian_admin', 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('327d9e95-d364-4e6e-96b1-9b80d5c337fe', 'guest-pos-1773417714726', 29000.00, 'Tai quay', NULL, NULL, 'NGAN_HANG_QR', 'CHO_XU_LY', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-13T16:01:54.728Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-13T16:01:54.728Z", "trang_thai": "CHO_XU_LY"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-13T16:02:05.482Z", "trang_thai": "HOAN_THANH"}]', '2026-03-13 16:01:54.769739', '2026-03-13 16:02:05.486346', 'TAI_CHO', NULL, NULL, 'thaian_admin', 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('35bef7d9-c1db-410f-8e1e-a21fffe1edb9', 'guest-smoke-905441', 29000.00, 'Test Address', NULL, NULL, 'NGAN_HANG_QR', 'CHO_XU_LY', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-17T18:23:50.487Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-17T18:23:50.487Z", "trang_thai": "CHO_XU_LY"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-18T00:24:05.562Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-18T00:24:05.609Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-18T00:24:05.647Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-18T00:24:05.678Z", "trang_thai": "HOAN_THANH"}]', '2026-03-17 18:23:50.501813', '2026-03-18 00:24:05.675834', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('f230b7e1-cb59-4760-92a9-8bdc79b8e4e9', 'b81d9738-535e-4475-884d-aeb3b7324f01', 45000.00, 'KTX Khu A, Dai hoc Cong nghe Moi aaaa', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-14T15:19:21.353Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-14T15:19:21.353Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T15:19:47.489Z", "trang_thai": "HOAN_THANH"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T15:19:57.069Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T15:21:31.247Z", "trang_thai": "MOI_TAO"}]', '2026-03-14 15:19:21.364932', '2026-03-14 15:21:31.251469', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('77115a2e-4900-4d7a-85e7-4b5d16d4117b', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, '28 Ter B Mạc Đĩnh Chi, Phường Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-18T01:29:20.160Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-18T01:29:20.160Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}]', '2026-03-18 01:29:20.166023', '2026-03-18 01:29:20.166023', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('687d5d6b-850e-4bef-8644-3428a3c579a1', 'b81d9738-535e-4475-884d-aeb3b7324f01', 45000.00, '71 hoàng văn thái, Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'DA_XAC_NHAN', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-14T15:44:14.530Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-14T15:44:14.530Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T16:02:14.141Z", "trang_thai": "HOAN_THANH"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T16:02:33.209Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T16:05:41.134Z", "trang_thai": "DA_XAC_NHAN"}]', '2026-03-14 15:44:14.532803', '2026-03-14 16:05:41.137419', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('ba1d6a75-6409-4bee-a355-24a6b6973f66', 'guest-pos-1773512912410', 45000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'DA_XAC_NHAN', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-14T18:28:32.412Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-14T18:28:32.412Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T18:28:35.108Z", "trang_thai": "DA_XAC_NHAN"}]', '2026-03-14 18:28:32.411292', '2026-03-14 18:28:35.106933', 'TAI_CHO', NULL, NULL, 'thaian_staff_thegracetower', 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('7a66ed6d-1ea2-4a43-8c57-2b08df22f292', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 39000.00, 'Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'CHO_XU_LY', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-21T06:53:57.265Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-21T06:53:57.265Z", "trang_thai": "CHO_XU_LY"}]', '2026-03-21 06:53:57.267774', '2026-03-21 06:53:57.267774', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('4f8fa1f0-261a-4388-bbce-956ae00ea049', 'guest-pos-1773517684312', 45000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-14T19:48:04.315Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-14T19:48:04.315Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T19:48:07.454Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T19:48:07.504Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T19:48:07.546Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T19:48:07.584Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-14T19:48:07.584Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-14 19:48:04.314508', '2026-03-14 19:48:07.583381', 'TAI_CHO', NULL, NULL, 'thaian_staff_thegracetower', 'THE_GRACE_TOWER', 500000.00, 455000.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('0d9482fe-3404-41bc-aa32-350de0752bb7', 'b81d9738-535e-4475-884d-aeb3b7324f01', 39000.00, '28 Ter B Mạc Đĩnh Chi, Phường Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-18T01:43:49.591Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-18T01:43:49.591Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}]', '2026-03-18 01:43:49.5959', '2026-03-18 01:43:49.5959', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('358f6f4f-fa2a-463a-ae3a-360bf56a2be7', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, '28 Ter B Mạc Đĩnh Chi, Phường Sài Gòn, Quận 1, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'THAT_BAI', 'DA_HUY', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-17T02:43:26.208Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-17T02:43:26.208Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Khach hang huy don", "thoi_gian": "2026-03-17T02:44:30.836Z", "trang_thai": "DA_HUY"}, {"loai": "PAYMENT", "ghi_chu": "Khach hang huy don", "thoi_gian": "2026-03-17T02:44:30.836Z", "trang_thai": "THAT_BAI"}]', '2026-03-17 02:43:26.21119', '2026-03-17 02:44:30.838562', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('cb628904-5a9d-4fa7-8cea-4f7848af65fb', 'b81d9738-535e-4475-884d-aeb3b7324f01', 1071000.00, '28 Ter B Mạc Đĩnh Chi, Phường Sài Gòn, Quận 1, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-17T03:06:13.374Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-17T03:06:13.374Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:06:34.345Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:06:34.385Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:06:34.414Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:06:34.448Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:06:34.448Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-17 03:06:13.377823', '2026-03-17 03:06:34.447004', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', 1071000.00, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('b9eb52cf-4f85-4ad1-b4ff-fb3b285e8fbf', 'b81d9738-535e-4475-884d-aeb3b7324f01', 39000.00, '28 Ter B Mạc Đĩnh Chi, Phường Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-20T17:57:44.415Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-20T17:57:44.415Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T18:15:33.309Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T18:15:33.359Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T18:15:33.392Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T18:15:33.422Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T18:15:33.422Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-20 17:57:44.420578', '2026-03-20 18:15:33.420769', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', 39000.00, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('ca477171-d11e-465e-90c6-351e66cec71c', 'guest-pos-1773717005667', 29000.00, 'Tai quay', NULL, NULL, 'NGAN_HANG_QR', 'CHO_XU_LY', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-17T03:10:05.669Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-17T03:10:05.669Z", "trang_thai": "CHO_XU_LY"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:10:14.623Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T16:50:24.153Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T16:50:24.738Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T16:50:24.877Z", "trang_thai": "HOAN_THANH"}]', '2026-03-17 03:10:05.667413', '2026-03-17 16:50:24.872991', 'TAI_CHO', NULL, NULL, 'thaian_staff_macdinhchi', 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('add48a2f-dd97-41c2-a05a-4b4d66b2ce6c', 'guest-pos-1773767826285', 29000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-17T17:17:06.287Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-17T17:17:06.287Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:17:08.677Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:17:08.720Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:17:08.762Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:17:08.803Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:17:08.803Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-17 17:17:06.286941', '2026-03-17 17:17:08.8018', 'TAI_CHO', NULL, NULL, 'thaian_staff_macdinhchi', 'MAC_DINH_CHI', 29000.00, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('8e89f317-6df9-457d-a4ee-bf36664691f8', 'guest-pos-1773717083248', 29000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-17T03:11:23.249Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-17T03:11:23.249Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:11:26.023Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:11:26.055Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:11:26.088Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:11:26.122Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T03:11:26.122Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-17 03:11:23.249557', '2026-03-17 03:11:26.120577', 'TAI_CHO', NULL, NULL, 'thaian_staff_macdinhchi', 'MAC_DINH_CHI', 50000.00, 21000.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('df84e119-6e03-47c5-b885-60b49b122a85', 'b81d9738-535e-4475-884d-aeb3b7324f01', 52200.00, '28 Ter B Mạc Đĩnh Chi, Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'CHO_XU_LY', 'MOI_TAO', 'SUMMER2026', 5800.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-17T04:04:54.265Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-17T04:04:54.265Z", "trang_thai": "CHO_XU_LY"}]', '2026-03-17 04:04:54.271624', '2026-03-17 04:04:54.271624', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('9f80309f-0c7e-45ed-8e14-86528fc13474', 'b81d9738-535e-4475-884d-aeb3b7324f01', 58000.00, '28 Ter B Mạc Đĩnh Chi, Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-17T04:07:49.837Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-17T04:07:49.837Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:44:56.038Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:44:56.109Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:44:56.147Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:44:56.191Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:44:56.191Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-17 04:07:49.839506', '2026-03-17 13:44:56.188654', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', 58000.00, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('21a4103b-2054-4d3a-815d-70865c74d5cc', 'guest-pos-1774032216919', 59000.00, 'Tai quay', NULL, NULL, 'NGAN_HANG_QR', 'DA_THANH_TOAN', 'DA_XAC_NHAN', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-20T18:43:36.936Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-20T18:43:36.936Z", "trang_thai": "CHO_XU_LY"}, {"loai": "ORDER", "ghi_chu": "Nhan thanh toan QR thanh cong", "thoi_gian": "2026-03-20T18:44:09.047Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "PAYMENT", "ghi_chu": "Nhan thanh toan QR thanh cong", "thoi_gian": "2026-03-20T18:44:09.047Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-20 18:43:36.935878', '2026-03-20 18:44:09.048678', 'TAI_CHO', NULL, NULL, 'thaian_manager_thegracetower', 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('4e3b5277-955c-4c9a-bd52-e7920c8d959c', 'guest-pos-1773755916028', 29000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-17T13:58:36.044Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-17T13:58:36.044Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:58:38.272Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:58:38.323Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:58:38.369Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:58:38.406Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T13:58:38.406Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-17 13:58:36.043104', '2026-03-17 13:58:38.405089', 'TAI_CHO', NULL, NULL, 'thaian_staff_macdinhchi', 'MAC_DINH_CHI', 29000.00, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('e20dc8d4-4796-4e23-b881-ea20cca1b45b', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 39000.00, 'Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'NGAN_HANG_QR', 'DA_THANH_TOAN', 'DA_XAC_NHAN', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-21T06:55:26.884Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-21T06:55:26.884Z", "trang_thai": "CHO_XU_LY"}, {"loai": "ORDER", "ghi_chu": "Nhan thanh toan QR thanh cong", "thoi_gian": "2026-03-21T06:57:23.028Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "PAYMENT", "ghi_chu": "Nhan thanh toan QR thanh cong", "thoi_gian": "2026-03-21T06:57:23.028Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-21 06:55:26.885078', '2026-03-21 06:57:23.02981', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 78000.00, 'Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'THAT_BAI', 'DA_HUY', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-21T06:47:40.941Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-21T06:47:40.941Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "ko can nua", "thoi_gian": "2026-03-21T06:48:12.814Z", "trang_thai": "DA_HUY"}, {"loai": "PAYMENT", "ghi_chu": "ko can nua", "thoi_gian": "2026-03-21T06:48:12.814Z", "trang_thai": "THAT_BAI"}]', '2026-03-21 06:47:40.943328', '2026-03-21 06:48:12.822723', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('61628d99-846e-4982-b12d-47c399e2695a', 'guest-pos-1774076449665', 39000.00, 'Tai quay', NULL, NULL, 'NGAN_HANG_QR', 'DA_THANH_TOAN', 'DA_XAC_NHAN', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-21T07:00:49.666Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-21T07:00:49.666Z", "trang_thai": "CHO_XU_LY"}, {"loai": "ORDER", "ghi_chu": "Nhan thanh toan QR thanh cong", "thoi_gian": "2026-03-21T07:01:08.073Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "PAYMENT", "ghi_chu": "Nhan thanh toan QR thanh cong", "thoi_gian": "2026-03-21T07:01:08.073Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-21 07:00:49.666289', '2026-03-21 07:01:08.074817', 'TAI_CHO', NULL, NULL, 'thaian_staff_macdinhchi', 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('7b86cb6c-afe6-4130-95c7-550acbc3c1b7', 'guest-pos-1773757918636', 29000.00, 'Tai quay', NULL, NULL, 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-17T14:31:58.643Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-17T14:31:58.643Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T14:32:00.861Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T14:32:00.912Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T14:32:00.952Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T14:32:00.996Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T14:32:00.996Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-17 14:31:58.640636', '2026-03-17 14:32:00.994289', 'TAI_CHO', NULL, NULL, 'thaian_staff_macdinhchi', 'MAC_DINH_CHI', 50000.00, 21000.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('9159cb4b-974d-4578-bf0d-a0d036f5e4bb', 'b81d9738-535e-4475-884d-aeb3b7324f01', 29000.00, '28 Ter B Mạc Đĩnh Chi, Phường Sài Gòn, Quận 1, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-15T16:40:06.603Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-15T16:40:06.603Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:42.340Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:42.824Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:43.028Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:43.132Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:43.132Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-15 16:40:06.61515', '2026-03-17 17:16:43.128254', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', 29000.00, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('421e3fac-b771-463a-800a-ddc5856e9679', 'b81d9738-535e-4475-884d-aeb3b7324f01', 45000.00, '28 Ter B Mạc Đĩnh Chi, Phường Sài Gòn, Quận 1, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-14T15:43:44.299Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-14T15:43:44.299Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:47.144Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:47.183Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:47.213Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:47.237Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-17T17:16:47.237Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-14 15:43:44.309357', '2026-03-17 17:16:47.236529', NULL, NULL, NULL, NULL, 'MAC_DINH_CHI', 45000.00, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('bb4f518c-a8a4-427c-bd8b-a879b4cb0df9', 'b81d9738-535e-4475-884d-aeb3b7324f01', 123000.00, '28 Ter B Mạc Đĩnh Chi, Phường Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-20T18:29:45.549Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-20T18:29:45.549Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T18:29:57.608Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T18:29:57.649Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T18:29:57.679Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T18:29:57.708Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T18:29:57.708Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-20 18:29:45.55816', '2026-03-20 18:29:57.705884', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', 123000.00, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('44174905-2603-4a1b-a387-02537473830f', 'b81d9738-535e-4475-884d-aeb3b7324f01', 40500.00, '28 Ter B Mạc Đĩnh Chi, Phường Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', 'SUMMER2026', 4500.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-20T18:41:51.477Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-20T18:41:51.477Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T18:42:06.094Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T18:42:06.142Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T18:42:06.174Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T18:42:06.206Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-20T18:42:06.206Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-20 18:41:51.480919', '2026-03-20 18:42:06.204198', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', 40500.00, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('ff995088-9792-4c84-862b-5b5488e34a54', 'guest-pos-1774034075317', 59000.00, 'Tai quay', NULL, NULL, 'NGAN_HANG_QR', 'DA_THANH_TOAN', 'DA_XAC_NHAN', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Tao don tai quay", "thoi_gian": "2026-03-20T19:14:35.324Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan POS", "thoi_gian": "2026-03-20T19:14:35.324Z", "trang_thai": "CHO_XU_LY"}, {"loai": "ORDER", "ghi_chu": "Nhan thanh toan QR thanh cong", "thoi_gian": "2026-03-20T19:15:03.451Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "PAYMENT", "ghi_chu": "Nhan thanh toan QR thanh cong", "thoi_gian": "2026-03-20T19:15:03.451Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-20 19:14:35.323121', '2026-03-20 19:15:03.454821', 'TAI_CHO', NULL, NULL, 'thaian_staff_macdinhchi', 'MAC_DINH_CHI', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('a79d81c8-2add-4893-97cc-8f346393176e', 'b81d9738-535e-4475-884d-aeb3b7324f01', 45000.00, '28 Ter B Mạc Đĩnh Chi, Phường Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN_KHI_NHAN_HANG', 'MOI_TAO', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-21T06:43:55.675Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-21T06:43:55.675Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}]', '2026-03-21 06:43:55.679557', '2026-03-21 06:43:55.679557', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', NULL, 0.00);
INSERT INTO orders.don_hang (ma_don_hang, ma_nguoi_dung, tong_tien, dia_chi_giao_hang, khung_gio_giao, ghi_chu, phuong_thuc_thanh_toan, trang_thai_thanh_toan, trang_thai_don_hang, ma_voucher, so_tien_giam, lich_su_trang_thai, ngay_tao, ngay_cap_nhat, loai_don_hang, ma_ban, ten_khach_hang, ten_thu_ngan, co_so_ma, tien_khach_dua, tien_thoi) VALUES ('ec39cbb2-7ff1-4960-9114-a3ba73364535', '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 39000.00, '28 Ter B Mạc Đĩnh Chi, Phường Tân Phú, Quận 7, Thành phố Hồ Chí Minh', '18:00 - 19:00', 'Dat tu web-customer', 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN', 'HOAN_THANH', NULL, 0.00, '[{"loai": "ORDER", "ghi_chu": "Don hang vua duoc tao", "thoi_gian": "2026-03-21T06:45:30.927Z", "trang_thai": "MOI_TAO"}, {"loai": "PAYMENT", "ghi_chu": "Khoi tao thanh toan", "thoi_gian": "2026-03-21T06:45:30.927Z", "trang_thai": "CHO_THANH_TOAN_KHI_NHAN_HANG"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-21T06:45:51.729Z", "trang_thai": "DA_XAC_NHAN"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-21T06:45:51.784Z", "trang_thai": "DANG_CHUAN_BI"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-21T06:45:51.825Z", "trang_thai": "DANG_GIAO"}, {"loai": "ORDER", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-21T06:45:51.865Z", "trang_thai": "HOAN_THANH"}, {"loai": "PAYMENT", "ghi_chu": "Nhan vien cua hang cap nhat trang thai", "thoi_gian": "2026-03-21T06:45:51.865Z", "trang_thai": "DA_THANH_TOAN"}]', '2026-03-21 06:45:30.930763', '2026-03-21 06:45:51.858432', NULL, NULL, NULL, NULL, 'THE_GRACE_TOWER', 39000.00, 0.00);


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
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (79, '601424b1-e745-45e3-a34e-4023d1d7832a', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-601424b1-253414', NULL, 29000.00, 'THANH_CONG', NULL, '2026-03-20 03:44:13.416632');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (65, '9f80309f-0c7e-45ed-8e14-86528fc13474', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-9f80309f-469848', NULL, 58000.00, 'THANH_CONG', NULL, '2026-03-17 04:07:49.849155');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (66, '4e3b5277-955c-4c9a-bd52-e7920c8d959c', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-4e3b5277-916075', NULL, 29000.00, 'THANH_CONG', NULL, '2026-03-17 13:58:36.043104');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (68, '7b86cb6c-afe6-4130-95c7-550acbc3c1b7', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-7b86cb6c-918695', NULL, 29000.00, 'THANH_CONG', NULL, '2026-03-17 14:31:58.640636');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (58, '9159cb4b-974d-4578-bf0d-a0d036f5e4bb', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-9159cb4b-806653', NULL, 29000.00, 'THANH_CONG', NULL, '2026-03-15 16:40:06.658124');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (50, '421e3fac-b771-463a-800a-ddc5856e9679', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-421e3fac-024328', NULL, 45000.00, 'THANH_CONG', NULL, '2026-03-14 15:43:44.330115');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (69, 'add48a2f-dd97-41c2-a05a-4b4d66b2ce6c', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-add48a2f-826305', NULL, 29000.00, 'THANH_CONG', NULL, '2026-03-17 17:17:06.286941');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (70, '0af2977d-023b-4b1a-9e47-f2debd1c7ce1', 'NGAN_HANG_QR', 'QR-0af2977d-456736', NULL, 25000.00, 'CHO_THANH_TOAN', NULL, '2026-03-17 18:00:56.739083');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (71, '5e3b0e5f-7b69-4e01-8732-d940f6823310', 'NGAN_HANG_QR', 'QR-5e3b0e5f-343126', NULL, 25000.00, 'CHO_THANH_TOAN', NULL, '2026-03-17 18:15:43.127044');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (72, '35bef7d9-c1db-410f-8e1e-a21fffe1edb9', 'NGAN_HANG_QR', 'QR-35bef7d9-830533', NULL, 29000.00, 'CHO_THANH_TOAN', NULL, '2026-03-17 18:23:50.535551');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (73, 'ae91e627-cadc-4fc9-b6e9-a74065d27ba0', 'NGAN_HANG_QR', 'QR-ae91e627-445136', NULL, 29000.00, 'CHO_THANH_TOAN', NULL, '2026-03-17 23:34:05.137273');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (74, '7266c327-5e7c-4bc8-af73-21ecbcd26be2', 'NGAN_HANG_QR', 'QR-7266c327-376085', 'FT26077845507885', 29000.00, 'THANH_CONG', '{"gateway":"MBBank","transactionDate":"2026-03-18 07:23:00","accountNumber":"025452790502","subAccount":null,"code":null,"content":"QR7266c327376085","transferType":"in","description":"BankAPINotify QR7266c327376085","transferAmount":29000,"referenceCode":"FT26077845507885","accumulated":221658,"id":45729801}', '2026-03-18 00:22:56.088501');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (75, '77115a2e-4900-4d7a-85e7-4b5d16d4117b', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-77115a2e-360191', NULL, 29000.00, 'CHO_THU_TIEN', NULL, '2026-03-18 01:29:20.193149');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (76, '0d9482fe-3404-41bc-aa32-350de0752bb7', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-0d9482fe-229629', NULL, 39000.00, 'CHO_THU_TIEN', NULL, '2026-03-18 01:43:49.631826');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (77, 'b47e798e-eb77-4489-bc7e-ee0a98328645', 'NGAN_HANG_QR', 'QR-b47e798e-078860', NULL, 29000.00, 'CHO_THANH_TOAN', NULL, '2026-03-18 02:14:38.861558');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (78, 'c29e7dfa-395d-4407-9d4c-fa549758ca83', 'NGAN_HANG_QR', 'QR-c29e7dfa-196443', 'FT26077960017256', 29000.00, 'THANH_CONG', '{"gateway":"MBBank","transactionDate":"2026-03-18 09:16:00","accountNumber":"025452790502","subAccount":null,"code":null,"content":"QRc29e7dfa196443","transferType":"in","description":"BankAPINotify QRc29e7dfa196443","transferAmount":29000,"referenceCode":"FT26077960017256","accumulated":279658,"id":45741461}', '2026-03-18 02:16:36.444554');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (80, 'b9eb52cf-4f85-4ad1-b4ff-fb3b285e8fbf', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-b9eb52cf-464450', NULL, 39000.00, 'THANH_CONG', NULL, '2026-03-20 17:57:44.451493');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (81, 'bb4f518c-a8a4-427c-bd8b-a879b4cb0df9', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-bb4f518c-385580', NULL, 123000.00, 'THANH_CONG', NULL, '2026-03-20 18:29:45.581419');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (82, 'd6172352-2ceb-4f75-8bc1-8366b9b78ed1', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-d6172352-504987', NULL, 90000.00, 'CHO_THU_TIEN', NULL, '2026-03-20 18:31:44.989018');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (83, 'afc08d85-f1bb-4e77-a5eb-0c6ad9cd28c9', 'NGAN_HANG_QR', 'QR-afc08d85-754018', 'FT26080444540040', 39000.00, 'THANH_CONG', '{"gateway":"MBBank","transactionDate":"2026-03-21 01:36:00","accountNumber":"025452790502","subAccount":null,"code":null,"content":"QRafc08d85754018","transferType":"in","description":"BankAPINotify QRafc08d85754018","transferAmount":39000,"referenceCode":"FT26080444540040","accumulated":254658,"id":46153809}', '2026-03-20 18:35:54.019994');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (84, '44174905-2603-4a1b-a387-02537473830f', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-44174905-111494', NULL, 40500.00, 'THANH_CONG', NULL, '2026-03-20 18:41:51.494806');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (86, '21a4103b-2054-4d3a-815d-70865c74d5cc', 'NGAN_HANG_QR', 'QR-21a4103b-216945', 'FT26080148454057', 59000.00, 'THANH_CONG', '{"gateway":"MBBank","transactionDate":"2026-03-21 01:44:00","accountNumber":"025452790502","subAccount":null,"code":null,"content":"QR21a4103b216945","transferType":"in","description":"BankAPINotify QR21a4103b216945","transferAmount":59000,"referenceCode":"FT26080148454057","accumulated":313658,"id":46154121}', '2026-03-20 18:43:36.935878');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (87, 'ff995088-9792-4c84-862b-5b5488e34a54', 'NGAN_HANG_QR', 'QR-ff995088-075379', 'FT26080963473268', 59000.00, 'THANH_CONG', '{"gateway":"MBBank","transactionDate":"2026-03-21 02:15:00","accountNumber":"025452790502","subAccount":null,"code":null,"content":"QRff995088075379","transferType":"in","description":"BankAPINotify QRff995088075379","transferAmount":59000,"referenceCode":"FT26080963473268","accumulated":372658,"id":46155007}', '2026-03-20 19:14:35.323121');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (88, 'a79d81c8-2add-4893-97cc-8f346393176e', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-a79d81c8-435698', NULL, 45000.00, 'CHO_THU_TIEN', NULL, '2026-03-21 06:43:55.70079');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (89, 'ec39cbb2-7ff1-4960-9114-a3ba73364535', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-ec39cbb2-530941', NULL, 39000.00, 'THANH_CONG', NULL, '2026-03-21 06:45:30.942163');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (90, '3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-3a916f71-660955', NULL, 78000.00, 'CHO_THU_TIEN', NULL, '2026-03-21 06:47:40.956367');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (91, 'b7df122e-d73a-45fa-abc5-f03e44c12c90', 'NGAN_HANG_QR', 'QR-b7df122e-854874', 'FT26080008279017', 39000.00, 'THANH_CONG', '{"gateway":"MBBank","transactionDate":"2026-03-21 13:51:00","accountNumber":"025452790502","subAccount":null,"code":null,"content":"QRb7df122e854874","transferType":"in","description":"BankAPINotify QRb7df122e854874","transferAmount":39000,"referenceCode":"FT26080008279017","accumulated":411658,"id":46214501}', '2026-03-21 06:50:54.874667');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (92, 'd8b32f5f-d817-4640-8fc7-6837da6726fc', 'NGAN_HANG_QR', 'QR-d8b32f5f-922371', NULL, 39000.00, 'CHO_THANH_TOAN', NULL, '2026-03-21 06:52:02.372177');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (93, '7a66ed6d-1ea2-4a43-8c57-2b08df22f292', 'NGAN_HANG_QR', 'QR-7a66ed6d-037277', NULL, 39000.00, 'CHO_THANH_TOAN', NULL, '2026-03-21 06:53:57.277696');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (94, 'e20dc8d4-4796-4e23-b881-ea20cca1b45b', 'NGAN_HANG_QR', 'QR-e20dc8d4-126899', 'FT26080749710825', 39000.00, 'THANH_CONG', '{"gateway":"MBBank","transactionDate":"2026-03-21 13:57:00","accountNumber":"025452790502","subAccount":null,"code":null,"content":"QRe20dc8d4126899","transferType":"in","description":"BankAPINotify QRe20dc8d4126899","transferAmount":39000,"referenceCode":"FT26080749710825","accumulated":404658,"id":46215169}', '2026-03-21 06:55:26.900114');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (95, 'a317ce7a-0c16-468c-86be-f6816354ee9b', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-a317ce7a-408828', NULL, 39000.00, 'CHO_THANH_TOAN', NULL, '2026-03-21 07:00:08.820833');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (96, '61628d99-846e-4982-b12d-47c399e2695a', 'NGAN_HANG_QR', 'QR-61628d99-449676', 'FT26080501849750', 39000.00, 'THANH_CONG', '{"gateway":"MBBank","transactionDate":"2026-03-21 14:01:00","accountNumber":"025452790502","subAccount":null,"code":null,"content":"QR61628d99449676","transferType":"in","description":"BankAPINotify QR61628d99449676","transferAmount":39000,"referenceCode":"FT26080501849750","accumulated":443658,"id":46215557}', '2026-03-21 07:00:49.666289');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (97, '5a69eceb-db45-4226-a6ad-3e5b820867e8', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-5a69eceb-721832', NULL, 117000.00, 'CHO_THU_TIEN', NULL, '2026-03-21 07:22:01.833499');
INSERT INTO orders.giao_dich_thanh_toan (ma_giao_dich, ma_don_hang, cong_thanh_toan, ma_tham_chieu, ma_giao_dich_cong, so_tien, trang_thai, du_lieu_tho, ngay_tao) VALUES (98, '8066d8e3-a14c-4f78-a912-491fb2b9828f', 'THANH_TOAN_KHI_NHAN_HANG', 'COD-8066d8e3-765167', NULL, 2548000.00, 'CHO_THU_TIEN', NULL, '2026-03-21 07:22:45.168094');


--
-- Data for Name: gio_hang; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.gio_hang (id, ma_nguoi_dung, ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url, kich_co, so_luong) VALUES (75, 'guest-cart-test-51eb8cd8-872d-404b-ab66-64f8c40b868b', 1, 'Ca phe sua da', 29000, 'https://example.com/a.jpg', 'Nh?', 1);
INSERT INTO orders.gio_hang (id, ma_nguoi_dung, ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url, kich_co, so_luong) VALUES (76, 'guest-cart-test-51eb8cd8-872d-404b-ab66-64f8c40b868b', 1, 'Ca phe sua da', 35000, 'https://example.com/a.jpg', 'V?a', 1);
INSERT INTO orders.gio_hang (id, ma_nguoi_dung, ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url, kich_co, so_luong) VALUES (148, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 1, 'Cà Phê Sữa Đá', 39000, 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_da_73fed306bafb4f87b4cb44573c900388_grande.png', 'Nhỏ', 1);
INSERT INTO orders.gio_hang (id, ma_nguoi_dung, ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url, kich_co, so_luong) VALUES (138, 'b81d9738-535e-4475-884d-aeb3b7324f01', 2, 'Trà Đào Cam Sả', 45000, '/images/products/tra-dao-cam-sa.jpg', 'Nhỏ', 1);
INSERT INTO orders.gio_hang (id, ma_nguoi_dung, ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url, kich_co, so_luong) VALUES (139, 'b81d9738-535e-4475-884d-aeb3b7324f01', 1, 'Cà Phê Sữa Đá', 39000, 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_da_73fed306bafb4f87b4cb44573c900388_grande.png', 'Nhỏ', 1);


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
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (95, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #9159cb4b-974d-4578-bf0d-a0d036f5e4bb da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', true, '{"ma_don_hang": "9159cb4b-974d-4578-bf0d-a0d036f5e4bb", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-17 17:16:42.620613+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (96, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #9159cb4b-974d-4578-bf0d-a0d036f5e4bb da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', true, '{"ma_don_hang": "9159cb4b-974d-4578-bf0d-a0d036f5e4bb", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-17 17:16:42.876873+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (97, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #9159cb4b-974d-4578-bf0d-a0d036f5e4bb da chuyen sang trang thai DANG_GIAO.', 'ORDER', true, '{"ma_don_hang": "9159cb4b-974d-4578-bf0d-a0d036f5e4bb", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-17 17:16:43.072346+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (98, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #9159cb4b-974d-4578-bf0d-a0d036f5e4bb da chuyen sang trang thai HOAN_THANH.', 'ORDER', true, '{"ma_don_hang": "9159cb4b-974d-4578-bf0d-a0d036f5e4bb", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-17 17:16:43.240854+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (99, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #421e3fac-b771-463a-800a-ddc5856e9679 da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', true, '{"ma_don_hang": "421e3fac-b771-463a-800a-ddc5856e9679", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-17 17:16:47.158811+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (100, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #421e3fac-b771-463a-800a-ddc5856e9679 da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', true, '{"ma_don_hang": "421e3fac-b771-463a-800a-ddc5856e9679", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-17 17:16:47.190163+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (101, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #421e3fac-b771-463a-800a-ddc5856e9679 da chuyen sang trang thai DANG_GIAO.', 'ORDER', true, '{"ma_don_hang": "421e3fac-b771-463a-800a-ddc5856e9679", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-17 17:16:47.218859+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (102, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #421e3fac-b771-463a-800a-ddc5856e9679 da chuyen sang trang thai HOAN_THANH.', 'ORDER', true, '{"ma_don_hang": "421e3fac-b771-463a-800a-ddc5856e9679", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-17 17:16:47.261475+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (113, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #ae91e627-cadc-4fc9-b6e9-a74065d27ba0 da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "ae91e627-cadc-4fc9-b6e9-a74065d27ba0", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-17 23:34:05.144793+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (114, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Da tao ma QR ngan hang', 'Don #ae91e627-cadc-4fc9-b6e9-a74065d27ba0 da san sang thanh toan qua QR.', 'PAYMENT', true, '{"ma_don_hang": "ae91e627-cadc-4fc9-b6e9-a74065d27ba0", "phuong_thuc_thanh_toan": "NGAN_HANG_QR"}', '2026-03-17 23:34:05.163409+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (115, 'guest-debug-qr2', 'Cap nhat trang thai don hang', 'Don #5e3b0e5f-7b69-4e01-8732-d940f6823310 da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', false, '{"ma_don_hang": "5e3b0e5f-7b69-4e01-8732-d940f6823310", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-17 23:46:40.185297+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (116, 'guest-debug-qr2', 'Cap nhat trang thai don hang', 'Don #5e3b0e5f-7b69-4e01-8732-d940f6823310 da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', false, '{"ma_don_hang": "5e3b0e5f-7b69-4e01-8732-d940f6823310", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-17 23:46:40.234239+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (117, 'guest-debug-qr2', 'Cap nhat trang thai don hang', 'Don #5e3b0e5f-7b69-4e01-8732-d940f6823310 da chuyen sang trang thai DANG_GIAO.', 'ORDER', false, '{"ma_don_hang": "5e3b0e5f-7b69-4e01-8732-d940f6823310", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-17 23:46:40.262644+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (118, 'guest-debug-qr2', 'Cap nhat trang thai don hang', 'Don #5e3b0e5f-7b69-4e01-8732-d940f6823310 da chuyen sang trang thai HOAN_THANH.', 'ORDER', false, '{"ma_don_hang": "5e3b0e5f-7b69-4e01-8732-d940f6823310", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-17 23:46:40.29852+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (122, 'guest-smoke-905441', 'Cap nhat trang thai don hang', 'Don #35bef7d9-c1db-410f-8e1e-a21fffe1edb9 da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', false, '{"ma_don_hang": "35bef7d9-c1db-410f-8e1e-a21fffe1edb9", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-18 00:24:05.582472+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (123, 'guest-smoke-905441', 'Cap nhat trang thai don hang', 'Don #35bef7d9-c1db-410f-8e1e-a21fffe1edb9 da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', false, '{"ma_don_hang": "35bef7d9-c1db-410f-8e1e-a21fffe1edb9", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-18 00:24:05.62268+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (124, 'guest-smoke-905441', 'Cap nhat trang thai don hang', 'Don #35bef7d9-c1db-410f-8e1e-a21fffe1edb9 da chuyen sang trang thai DANG_GIAO.', 'ORDER', false, '{"ma_don_hang": "35bef7d9-c1db-410f-8e1e-a21fffe1edb9", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-18 00:24:05.655424+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (125, 'guest-smoke-905441', 'Cap nhat trang thai don hang', 'Don #35bef7d9-c1db-410f-8e1e-a21fffe1edb9 da chuyen sang trang thai HOAN_THANH.', 'ORDER', false, '{"ma_don_hang": "35bef7d9-c1db-410f-8e1e-a21fffe1edb9", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-18 00:24:05.685823+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (119, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #7266c327-5e7c-4bc8-af73-21ecbcd26be2 da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "7266c327-5e7c-4bc8-af73-21ecbcd26be2", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-18 00:22:56.099749+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (120, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Da tao ma QR ngan hang', 'Don #7266c327-5e7c-4bc8-af73-21ecbcd26be2 da san sang thanh toan qua QR.', 'PAYMENT', true, '{"ma_don_hang": "7266c327-5e7c-4bc8-af73-21ecbcd26be2", "phuong_thuc_thanh_toan": "NGAN_HANG_QR"}', '2026-03-18 00:22:56.204664+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (121, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Nhan tien QR thanh cong', 'Don #7266c327-5e7c-4bc8-af73-21ecbcd26be2 da nhan thanh toan QR va duoc xac nhan.', 'PAYMENT', true, '{"ma_don_hang": "7266c327-5e7c-4bc8-af73-21ecbcd26be2", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-18 00:23:27.959513+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (129, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Co don hang moi', 'Don #0D9482FE vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "0d9482fe-3404-41bc-aa32-350de0752bb7", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-18 01:43:49.696849+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (130, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Co don hang moi', 'Don #0D9482FE vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "0d9482fe-3404-41bc-aa32-350de0752bb7", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-18 01:43:49.720235+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (133, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Co don hang moi', 'Don #B47E798E vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "b47e798e-eb77-4489-bc7e-ee0a98328645", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-18 02:14:38.952411+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (134, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Co don hang moi', 'Don #B47E798E vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "b47e798e-eb77-4489-bc7e-ee0a98328645", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-18 02:14:38.96051+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (137, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Co don hang moi', 'Don #C29E7DFA vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "c29e7dfa-395d-4407-9d4c-fa549758ca83", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-18 02:16:36.485989+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (138, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Co don hang moi', 'Don #C29E7DFA vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "c29e7dfa-395d-4407-9d4c-fa549758ca83", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-18 02:16:36.504061+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (140, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Cap nhat trang thai don hang', 'Don #C29E7DFA -> Da xac nhan.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "c29e7dfa-395d-4407-9d4c-fa549758ca83", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-18 02:16:50.416797+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (141, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Cap nhat trang thai don hang', 'Don #C29E7DFA -> Da xac nhan.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "c29e7dfa-395d-4407-9d4c-fa549758ca83", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-18 02:16:50.416828+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (142, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Cap nhat thanh toan don hang', 'Don #C29E7DFA -> Da thanh toan.', 'PAYMENT', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "c29e7dfa-395d-4407-9d4c-fa549758ca83", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-18 02:16:50.425761+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (143, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Cap nhat thanh toan don hang', 'Don #C29E7DFA -> Da thanh toan.', 'PAYMENT', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "c29e7dfa-395d-4407-9d4c-fa549758ca83", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-18 02:16:50.425834+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (126, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #77115a2e-4900-4d7a-85e7-4b5d16d4117b da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "77115a2e-4900-4d7a-85e7-4b5d16d4117b", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-18 01:29:20.201262+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (127, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #77115a2e-4900-4d7a-85e7-4b5d16d4117b se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "77115a2e-4900-4d7a-85e7-4b5d16d4117b", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-18 01:29:20.242986+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (128, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #0d9482fe-3404-41bc-aa32-350de0752bb7 da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "0d9482fe-3404-41bc-aa32-350de0752bb7", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-18 01:43:49.642072+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (131, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #0d9482fe-3404-41bc-aa32-350de0752bb7 se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "0d9482fe-3404-41bc-aa32-350de0752bb7", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-18 01:43:49.781554+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (132, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #b47e798e-eb77-4489-bc7e-ee0a98328645 da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "b47e798e-eb77-4489-bc7e-ee0a98328645", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-18 02:14:38.872476+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (135, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Da tao ma QR ngan hang', 'Don #b47e798e-eb77-4489-bc7e-ee0a98328645 da san sang thanh toan qua QR.', 'PAYMENT', true, '{"ma_don_hang": "b47e798e-eb77-4489-bc7e-ee0a98328645", "phuong_thuc_thanh_toan": "NGAN_HANG_QR"}', '2026-03-18 02:14:38.968935+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (136, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #c29e7dfa-395d-4407-9d4c-fa549758ca83 da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "c29e7dfa-395d-4407-9d4c-fa549758ca83", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-18 02:16:36.449156+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (139, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Da tao ma QR ngan hang', 'Don #c29e7dfa-395d-4407-9d4c-fa549758ca83 da san sang thanh toan qua QR.', 'PAYMENT', true, '{"ma_don_hang": "c29e7dfa-395d-4407-9d4c-fa549758ca83", "phuong_thuc_thanh_toan": "NGAN_HANG_QR"}', '2026-03-18 02:16:36.514663+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (144, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Nhan tien QR thanh cong', 'Don #c29e7dfa-395d-4407-9d4c-fa549758ca83 da nhan thanh toan QR va duoc xac nhan.', 'PAYMENT', true, '{"ma_don_hang": "c29e7dfa-395d-4407-9d4c-fa549758ca83", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-18 02:16:50.471593+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (146, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Co don hang moi', 'Don #601424B1 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "601424b1-e745-45e3-a34e-4023d1d7832a", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-20 03:44:13.604289+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (147, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Co don hang moi', 'Don #601424B1 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "601424b1-e745-45e3-a34e-4023d1d7832a", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-20 03:44:13.622359+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (145, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #601424b1-e745-45e3-a34e-4023d1d7832a da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "601424b1-e745-45e3-a34e-4023d1d7832a", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-20 03:44:13.428632+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (148, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #601424b1-e745-45e3-a34e-4023d1d7832a se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "601424b1-e745-45e3-a34e-4023d1d7832a", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-20 03:44:13.697642+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (149, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #601424b1-e745-45e3-a34e-4023d1d7832a da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', true, '{"ma_don_hang": "601424b1-e745-45e3-a34e-4023d1d7832a", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-20 03:44:44.473416+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (150, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #601424b1-e745-45e3-a34e-4023d1d7832a da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', true, '{"ma_don_hang": "601424b1-e745-45e3-a34e-4023d1d7832a", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-20 03:44:44.556308+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (151, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #601424b1-e745-45e3-a34e-4023d1d7832a da chuyen sang trang thai DANG_GIAO.', 'ORDER', true, '{"ma_don_hang": "601424b1-e745-45e3-a34e-4023d1d7832a", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-20 03:44:44.620737+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (152, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #601424b1-e745-45e3-a34e-4023d1d7832a da chuyen sang trang thai HOAN_THANH.', 'ORDER', true, '{"ma_don_hang": "601424b1-e745-45e3-a34e-4023d1d7832a", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-20 03:44:44.758409+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (154, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Co don hang moi', 'Don #B9EB52CF vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "b9eb52cf-4f85-4ad1-b4ff-fb3b285e8fbf", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-20 17:57:44.512854+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (155, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Co don hang moi', 'Don #B9EB52CF vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "b9eb52cf-4f85-4ad1-b4ff-fb3b285e8fbf", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-20 17:57:44.512948+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (153, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #b9eb52cf-4f85-4ad1-b4ff-fb3b285e8fbf da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "b9eb52cf-4f85-4ad1-b4ff-fb3b285e8fbf", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-20 17:57:44.462559+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (156, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #b9eb52cf-4f85-4ad1-b4ff-fb3b285e8fbf se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "b9eb52cf-4f85-4ad1-b4ff-fb3b285e8fbf", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-20 17:57:44.553745+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (162, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Co don hang moi', 'Don #BB4F518C vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "bb4f518c-a8a4-427c-bd8b-a879b4cb0df9", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-20 18:29:45.644236+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (163, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Co don hang moi', 'Don #BB4F518C vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "bb4f518c-a8a4-427c-bd8b-a879b4cb0df9", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-20 18:29:45.659152+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (170, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Co don hang moi', 'Don #D6172352 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "d6172352-2ceb-4f75-8bc1-8366b9b78ed1", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-20 18:31:45.087842+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (171, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Co don hang moi', 'Don #D6172352 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "d6172352-2ceb-4f75-8bc1-8366b9b78ed1", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-20 18:31:45.14042+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (173, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Cap nhat trang thai don hang', 'Don #D6172352 -> Da huy.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "d6172352-2ceb-4f75-8bc1-8366b9b78ed1", "trang_thai_don_hang": "DA_HUY", "trang_thai_thanh_toan": "THAT_BAI"}', '2026-03-20 18:31:56.77821+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (174, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Cap nhat trang thai don hang', 'Don #D6172352 -> Da huy.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "d6172352-2ceb-4f75-8bc1-8366b9b78ed1", "trang_thai_don_hang": "DA_HUY", "trang_thai_thanh_toan": "THAT_BAI"}', '2026-03-20 18:31:56.778324+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (175, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Cap nhat thanh toan don hang', 'Don #D6172352 -> That bai.', 'PAYMENT', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "d6172352-2ceb-4f75-8bc1-8366b9b78ed1", "trang_thai_don_hang": "DA_HUY", "trang_thai_thanh_toan": "THAT_BAI"}', '2026-03-20 18:31:56.794285+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (176, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Cap nhat thanh toan don hang', 'Don #D6172352 -> That bai.', 'PAYMENT', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "d6172352-2ceb-4f75-8bc1-8366b9b78ed1", "trang_thai_don_hang": "DA_HUY", "trang_thai_thanh_toan": "THAT_BAI"}', '2026-03-20 18:31:56.794374+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (179, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Co don hang moi', 'Don #AFC08D85 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "afc08d85-f1bb-4e77-a5eb-0c6ad9cd28c9", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-20 18:35:54.119546+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (180, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Co don hang moi', 'Don #AFC08D85 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "afc08d85-f1bb-4e77-a5eb-0c6ad9cd28c9", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-20 18:35:54.119615+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (182, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Cap nhat trang thai don hang', 'Don #AFC08D85 -> Da xac nhan.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "afc08d85-f1bb-4e77-a5eb-0c6ad9cd28c9", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-20 18:36:22.561482+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (183, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Cap nhat trang thai don hang', 'Don #AFC08D85 -> Da xac nhan.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "afc08d85-f1bb-4e77-a5eb-0c6ad9cd28c9", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-20 18:36:22.581358+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (184, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Cap nhat thanh toan don hang', 'Don #AFC08D85 -> Da thanh toan.', 'PAYMENT', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "afc08d85-f1bb-4e77-a5eb-0c6ad9cd28c9", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-20 18:36:22.606466+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (185, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Cap nhat thanh toan don hang', 'Don #AFC08D85 -> Da thanh toan.', 'PAYMENT', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "afc08d85-f1bb-4e77-a5eb-0c6ad9cd28c9", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-20 18:36:22.606584+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (186, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Nhan tien QR thanh cong', 'Don #afc08d85-f1bb-4e77-a5eb-0c6ad9cd28c9 da nhan thanh toan QR va duoc xac nhan.', 'PAYMENT', true, '{"ma_don_hang": "afc08d85-f1bb-4e77-a5eb-0c6ad9cd28c9", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-20 18:36:22.626374+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (188, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Co don hang moi', 'Don #44174905 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "44174905-2603-4a1b-a387-02537473830f", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-20 18:41:51.732443+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (189, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Co don hang moi', 'Don #44174905 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "44174905-2603-4a1b-a387-02537473830f", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-20 18:41:51.732649+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (195, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Co don hang moi', 'Don #8727242C vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "8727242c-b06a-48a7-b3f0-ba9c18bd1d91", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-20 18:42:36.905859+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (196, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Co don hang moi', 'Don #8727242C vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "8727242c-b06a-48a7-b3f0-ba9c18bd1d91", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-20 18:42:36.919226+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (197, 'guest-pos-1774032156624', 'Cap nhat trang thai don hang', 'Don #8727242c-b06a-48a7-b3f0-ba9c18bd1d91 da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', false, '{"ma_don_hang": "8727242c-b06a-48a7-b3f0-ba9c18bd1d91", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-20 18:42:40.828111+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (198, 'guest-pos-1774032156624', 'Cap nhat trang thai don hang', 'Don #8727242c-b06a-48a7-b3f0-ba9c18bd1d91 da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', false, '{"ma_don_hang": "8727242c-b06a-48a7-b3f0-ba9c18bd1d91", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-20 18:42:40.866151+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (199, 'guest-pos-1774032156624', 'Cap nhat trang thai don hang', 'Don #8727242c-b06a-48a7-b3f0-ba9c18bd1d91 da chuyen sang trang thai DA_HUY.', 'ORDER', false, '{"ma_don_hang": "8727242c-b06a-48a7-b3f0-ba9c18bd1d91", "trang_thai_don_hang": "DA_HUY"}', '2026-03-20 18:43:02.650912+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (200, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Don hang da bi xoa', 'Don #8727242C da duoc xoa khoi he thong cua chi nhanh.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "8727242c-b06a-48a7-b3f0-ba9c18bd1d91", "trang_thai_don_hang": "DA_HUY"}', '2026-03-20 18:43:05.922932+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (201, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Don hang da bi xoa', 'Don #8727242C da duoc xoa khoi he thong cua chi nhanh.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "8727242c-b06a-48a7-b3f0-ba9c18bd1d91", "trang_thai_don_hang": "DA_HUY"}', '2026-03-20 18:43:05.935689+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (202, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Co don hang moi', 'Don #21A4103B vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "21a4103b-2054-4d3a-815d-70865c74d5cc", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-20 18:43:37.050009+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (203, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Co don hang moi', 'Don #21A4103B vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "21a4103b-2054-4d3a-815d-70865c74d5cc", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-20 18:43:37.067556+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (204, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Cap nhat trang thai don hang', 'Don #21A4103B -> Da xac nhan.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "21a4103b-2054-4d3a-815d-70865c74d5cc", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-20 18:44:09.06067+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (205, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Cap nhat trang thai don hang', 'Don #21A4103B -> Da xac nhan.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "21a4103b-2054-4d3a-815d-70865c74d5cc", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-20 18:44:09.075253+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (206, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Cap nhat thanh toan don hang', 'Don #21A4103B -> Da thanh toan.', 'PAYMENT', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "21a4103b-2054-4d3a-815d-70865c74d5cc", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-20 18:44:09.090942+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (208, 'guest-pos-1774032216919', 'Nhan tien QR thanh cong', 'Don #21a4103b-2054-4d3a-815d-70865c74d5cc da nhan thanh toan QR va duoc xac nhan.', 'PAYMENT', false, '{"ma_don_hang": "21a4103b-2054-4d3a-815d-70865c74d5cc", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-20 18:44:09.109125+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (207, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Cap nhat thanh toan don hang', 'Don #21A4103B -> Da thanh toan.', 'PAYMENT', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "21a4103b-2054-4d3a-815d-70865c74d5cc", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-20 18:44:09.091101+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (209, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Co don hang moi', 'Don #FF995088 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "ff995088-9792-4c84-862b-5b5488e34a54", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-20 19:14:35.408713+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (210, '03f1a264-f077-44b4-96da-9de76cc75989', 'Co don hang moi', 'Don #FF995088 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "ff995088-9792-4c84-862b-5b5488e34a54", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-20 19:14:35.408852+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (211, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Cap nhat trang thai don hang', 'Don #FF995088 -> Da xac nhan.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "ff995088-9792-4c84-862b-5b5488e34a54", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-20 19:15:03.512372+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (212, '03f1a264-f077-44b4-96da-9de76cc75989', 'Cap nhat trang thai don hang', 'Don #FF995088 -> Da xac nhan.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "ff995088-9792-4c84-862b-5b5488e34a54", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-20 19:15:03.527717+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (213, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Cap nhat thanh toan don hang', 'Don #FF995088 -> Da thanh toan.', 'PAYMENT', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "ff995088-9792-4c84-862b-5b5488e34a54", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-20 19:15:03.561336+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (214, '03f1a264-f077-44b4-96da-9de76cc75989', 'Cap nhat thanh toan don hang', 'Don #FF995088 -> Da thanh toan.', 'PAYMENT', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "ff995088-9792-4c84-862b-5b5488e34a54", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-20 19:15:03.561463+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (215, 'guest-pos-1774034075317', 'Nhan tien QR thanh cong', 'Don #ff995088-9792-4c84-862b-5b5488e34a54 da nhan thanh toan QR va duoc xac nhan.', 'PAYMENT', false, '{"ma_don_hang": "ff995088-9792-4c84-862b-5b5488e34a54", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-20 19:15:03.591017+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (157, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #b9eb52cf-4f85-4ad1-b4ff-fb3b285e8fbf da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', true, '{"ma_don_hang": "b9eb52cf-4f85-4ad1-b4ff-fb3b285e8fbf", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-20 18:15:33.324745+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (158, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #b9eb52cf-4f85-4ad1-b4ff-fb3b285e8fbf da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', true, '{"ma_don_hang": "b9eb52cf-4f85-4ad1-b4ff-fb3b285e8fbf", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-20 18:15:33.366955+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (159, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #b9eb52cf-4f85-4ad1-b4ff-fb3b285e8fbf da chuyen sang trang thai DANG_GIAO.', 'ORDER', true, '{"ma_don_hang": "b9eb52cf-4f85-4ad1-b4ff-fb3b285e8fbf", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-20 18:15:33.399423+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (160, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #b9eb52cf-4f85-4ad1-b4ff-fb3b285e8fbf da chuyen sang trang thai HOAN_THANH.', 'ORDER', true, '{"ma_don_hang": "b9eb52cf-4f85-4ad1-b4ff-fb3b285e8fbf", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-20 18:15:33.437178+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (161, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #bb4f518c-a8a4-427c-bd8b-a879b4cb0df9 da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "bb4f518c-a8a4-427c-bd8b-a879b4cb0df9", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-20 18:29:45.587436+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (164, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #bb4f518c-a8a4-427c-bd8b-a879b4cb0df9 se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "bb4f518c-a8a4-427c-bd8b-a879b4cb0df9", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-20 18:29:45.680206+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (165, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #bb4f518c-a8a4-427c-bd8b-a879b4cb0df9 da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', true, '{"ma_don_hang": "bb4f518c-a8a4-427c-bd8b-a879b4cb0df9", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-20 18:29:57.62407+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (166, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #bb4f518c-a8a4-427c-bd8b-a879b4cb0df9 da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', true, '{"ma_don_hang": "bb4f518c-a8a4-427c-bd8b-a879b4cb0df9", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-20 18:29:57.655606+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (167, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #bb4f518c-a8a4-427c-bd8b-a879b4cb0df9 da chuyen sang trang thai DANG_GIAO.', 'ORDER', true, '{"ma_don_hang": "bb4f518c-a8a4-427c-bd8b-a879b4cb0df9", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-20 18:29:57.685945+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (168, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #bb4f518c-a8a4-427c-bd8b-a879b4cb0df9 da chuyen sang trang thai HOAN_THANH.', 'ORDER', true, '{"ma_don_hang": "bb4f518c-a8a4-427c-bd8b-a879b4cb0df9", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-20 18:29:57.723449+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (169, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #d6172352-2ceb-4f75-8bc1-8366b9b78ed1 da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "d6172352-2ceb-4f75-8bc1-8366b9b78ed1", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-20 18:31:44.999846+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (172, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #d6172352-2ceb-4f75-8bc1-8366b9b78ed1 se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "d6172352-2ceb-4f75-8bc1-8366b9b78ed1", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-20 18:31:45.193251+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (177, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da huy', 'Don #d6172352-2ceb-4f75-8bc1-8366b9b78ed1 da duoc huy.', 'ORDER', true, '{"ma_don_hang": "d6172352-2ceb-4f75-8bc1-8366b9b78ed1", "trang_thai_don_hang": "DA_HUY"}', '2026-03-20 18:31:56.803632+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (178, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #afc08d85-f1bb-4e77-a5eb-0c6ad9cd28c9 da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "afc08d85-f1bb-4e77-a5eb-0c6ad9cd28c9", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-20 18:35:54.029528+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (181, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Da tao ma QR ngan hang', 'Don #afc08d85-f1bb-4e77-a5eb-0c6ad9cd28c9 da san sang thanh toan qua QR.', 'PAYMENT', true, '{"ma_don_hang": "afc08d85-f1bb-4e77-a5eb-0c6ad9cd28c9", "phuong_thuc_thanh_toan": "NGAN_HANG_QR"}', '2026-03-20 18:35:54.138913+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (187, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #44174905-2603-4a1b-a387-02537473830f da duoc tao thanh cong. Giam gia: 4.500d', 'ORDER', true, '{"ma_don_hang": "44174905-2603-4a1b-a387-02537473830f", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-20 18:41:51.680801+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (190, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #44174905-2603-4a1b-a387-02537473830f se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "44174905-2603-4a1b-a387-02537473830f", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-20 18:41:51.746975+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (191, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #44174905-2603-4a1b-a387-02537473830f da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', true, '{"ma_don_hang": "44174905-2603-4a1b-a387-02537473830f", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-20 18:42:06.101224+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (192, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #44174905-2603-4a1b-a387-02537473830f da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', true, '{"ma_don_hang": "44174905-2603-4a1b-a387-02537473830f", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-20 18:42:06.151062+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (193, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #44174905-2603-4a1b-a387-02537473830f da chuyen sang trang thai DANG_GIAO.', 'ORDER', true, '{"ma_don_hang": "44174905-2603-4a1b-a387-02537473830f", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-20 18:42:06.179439+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (194, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Cap nhat trang thai don hang', 'Don #44174905-2603-4a1b-a387-02537473830f da chuyen sang trang thai HOAN_THANH.', 'ORDER', true, '{"ma_don_hang": "44174905-2603-4a1b-a387-02537473830f", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-20 18:42:06.221098+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (216, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don hang da duoc tao', 'Don #a79d81c8-2add-4893-97cc-8f346393176e da duoc tao thanh cong.', 'ORDER', false, '{"ma_don_hang": "a79d81c8-2add-4893-97cc-8f346393176e", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-21 06:43:55.707494+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (217, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Co don hang moi', 'Don #A79D81C8 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "a79d81c8-2add-4893-97cc-8f346393176e", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 06:43:55.763922+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (218, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Co don hang moi', 'Don #A79D81C8 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "a79d81c8-2add-4893-97cc-8f346393176e", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 06:43:55.81339+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (219, 'b81d9738-535e-4475-884d-aeb3b7324f01', 'Don COD cho thu tien', 'Don #a79d81c8-2add-4893-97cc-8f346393176e se duoc thu tien khi giao hang.', 'PAYMENT', false, '{"ma_don_hang": "a79d81c8-2add-4893-97cc-8f346393176e", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 06:43:55.855694+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (220, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Don hang da duoc tao', 'Don #ec39cbb2-7ff1-4960-9114-a3ba73364535 da duoc tao thanh cong.', 'ORDER', false, '{"ma_don_hang": "ec39cbb2-7ff1-4960-9114-a3ba73364535", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-21 06:45:30.947285+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (221, '702cbcb9-9722-4d40-884d-51fff33ece8f', 'Co don hang moi', 'Don #EC39CBB2 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "ec39cbb2-7ff1-4960-9114-a3ba73364535", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 06:45:30.993563+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (222, 'be7731a3-e0f0-4b0d-a419-2f8f1195054d', 'Co don hang moi', 'Don #EC39CBB2 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "THE_GRACE_TOWER", "ma_don_hang": "ec39cbb2-7ff1-4960-9114-a3ba73364535", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 06:45:31.023132+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (223, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Don COD cho thu tien', 'Don #ec39cbb2-7ff1-4960-9114-a3ba73364535 se duoc thu tien khi giao hang.', 'PAYMENT', false, '{"ma_don_hang": "ec39cbb2-7ff1-4960-9114-a3ba73364535", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 06:45:31.039567+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (224, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Cap nhat trang thai don hang', 'Don #ec39cbb2-7ff1-4960-9114-a3ba73364535 da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', false, '{"ma_don_hang": "ec39cbb2-7ff1-4960-9114-a3ba73364535", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-21 06:45:51.749389+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (225, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Cap nhat trang thai don hang', 'Don #ec39cbb2-7ff1-4960-9114-a3ba73364535 da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', false, '{"ma_don_hang": "ec39cbb2-7ff1-4960-9114-a3ba73364535", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-21 06:45:51.796917+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (226, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Cap nhat trang thai don hang', 'Don #ec39cbb2-7ff1-4960-9114-a3ba73364535 da chuyen sang trang thai DANG_GIAO.', 'ORDER', false, '{"ma_don_hang": "ec39cbb2-7ff1-4960-9114-a3ba73364535", "trang_thai_don_hang": "DANG_GIAO"}', '2026-03-21 06:45:51.836697+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (227, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Cap nhat trang thai don hang', 'Don #ec39cbb2-7ff1-4960-9114-a3ba73364535 da chuyen sang trang thai HOAN_THANH.', 'ORDER', true, '{"ma_don_hang": "ec39cbb2-7ff1-4960-9114-a3ba73364535", "trang_thai_don_hang": "HOAN_THANH"}', '2026-03-21 06:45:51.885657+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (228, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Don hang da duoc tao', 'Don #3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb da duoc tao thanh cong.', 'ORDER', false, '{"ma_don_hang": "3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-21 06:47:40.961444+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (229, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Co don hang moi', 'Don #3A916F71 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 06:47:41.005156+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (230, '03f1a264-f077-44b4-96da-9de76cc75989', 'Co don hang moi', 'Don #3A916F71 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 06:47:41.021521+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (231, '86bd00a2-395e-42e1-8863-2d8492c64c1d', 'Co don hang moi', 'Don #3A916F71 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 06:47:41.021909+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (232, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Don COD cho thu tien', 'Don #3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb se duoc thu tien khi giao hang.', 'PAYMENT', false, '{"ma_don_hang": "3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 06:47:41.037479+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (233, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Don hang da duoc cap nhat', 'Don #3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb da duoc chinh sua truoc khi xac nhan.', 'ORDER', false, '{"ma_don_hang": "3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-21 06:47:59.212476+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (234, '86bd00a2-395e-42e1-8863-2d8492c64c1d', 'Don hang duoc chinh sua', 'Don #3A916F71 da duoc cap nhat thong tin.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-21 06:47:59.322046+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (235, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Don hang duoc chinh sua', 'Don #3A916F71 da duoc cap nhat thong tin.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-21 06:47:59.343776+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (236, '03f1a264-f077-44b4-96da-9de76cc75989', 'Don hang duoc chinh sua', 'Don #3A916F71 da duoc cap nhat thong tin.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-21 06:47:59.348055+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (237, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Cap nhat trang thai don hang', 'Don #3A916F71 -> Da huy.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb", "trang_thai_don_hang": "DA_HUY", "trang_thai_thanh_toan": "THAT_BAI"}', '2026-03-21 06:48:12.882176+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (238, '03f1a264-f077-44b4-96da-9de76cc75989', 'Cap nhat trang thai don hang', 'Don #3A916F71 -> Da huy.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb", "trang_thai_don_hang": "DA_HUY", "trang_thai_thanh_toan": "THAT_BAI"}', '2026-03-21 06:48:12.925783+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (239, '86bd00a2-395e-42e1-8863-2d8492c64c1d', 'Cap nhat trang thai don hang', 'Don #3A916F71 -> Da huy.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb", "trang_thai_don_hang": "DA_HUY", "trang_thai_thanh_toan": "THAT_BAI"}', '2026-03-21 06:48:12.932573+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (240, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Cap nhat thanh toan don hang', 'Don #3A916F71 -> That bai.', 'PAYMENT', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb", "trang_thai_don_hang": "DA_HUY", "trang_thai_thanh_toan": "THAT_BAI"}', '2026-03-21 06:48:13.049478+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (241, '86bd00a2-395e-42e1-8863-2d8492c64c1d', 'Cap nhat thanh toan don hang', 'Don #3A916F71 -> That bai.', 'PAYMENT', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb", "trang_thai_don_hang": "DA_HUY", "trang_thai_thanh_toan": "THAT_BAI"}', '2026-03-21 06:48:13.049643+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (243, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Don hang da huy', 'Don #3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb da duoc huy.', 'ORDER', false, '{"ma_don_hang": "3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb", "trang_thai_don_hang": "DA_HUY"}', '2026-03-21 06:48:13.108119+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (242, '03f1a264-f077-44b4-96da-9de76cc75989', 'Cap nhat thanh toan don hang', 'Don #3A916F71 -> That bai.', 'PAYMENT', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "3a916f71-e3c8-4bee-9ee6-6fcae8dee4fb", "trang_thai_don_hang": "DA_HUY", "trang_thai_thanh_toan": "THAT_BAI"}', '2026-03-21 06:48:13.04975+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (244, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Don hang da duoc tao', 'Don #b7df122e-d73a-45fa-abc5-f03e44c12c90 da duoc tao thanh cong.', 'ORDER', false, '{"ma_don_hang": "b7df122e-d73a-45fa-abc5-f03e44c12c90", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-21 06:50:54.878804+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (245, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Co don hang moi', 'Don #B7DF122E vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "b7df122e-d73a-45fa-abc5-f03e44c12c90", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-21 06:50:54.929741+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (246, '86bd00a2-395e-42e1-8863-2d8492c64c1d', 'Co don hang moi', 'Don #B7DF122E vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "b7df122e-d73a-45fa-abc5-f03e44c12c90", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-21 06:50:54.958313+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (247, '03f1a264-f077-44b4-96da-9de76cc75989', 'Co don hang moi', 'Don #B7DF122E vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "b7df122e-d73a-45fa-abc5-f03e44c12c90", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-21 06:50:54.9589+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (248, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Da tao ma QR ngan hang', 'Don #b7df122e-d73a-45fa-abc5-f03e44c12c90 da san sang thanh toan qua QR.', 'PAYMENT', false, '{"ma_don_hang": "b7df122e-d73a-45fa-abc5-f03e44c12c90", "phuong_thuc_thanh_toan": "NGAN_HANG_QR"}', '2026-03-21 06:50:54.983271+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (249, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Cap nhat trang thai don hang', 'Don #B7DF122E -> Da xac nhan.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "b7df122e-d73a-45fa-abc5-f03e44c12c90", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 06:51:24.694408+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (250, '86bd00a2-395e-42e1-8863-2d8492c64c1d', 'Cap nhat trang thai don hang', 'Don #B7DF122E -> Da xac nhan.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "b7df122e-d73a-45fa-abc5-f03e44c12c90", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 06:51:24.694519+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (251, '03f1a264-f077-44b4-96da-9de76cc75989', 'Cap nhat trang thai don hang', 'Don #B7DF122E -> Da xac nhan.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "b7df122e-d73a-45fa-abc5-f03e44c12c90", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 06:51:24.710628+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (252, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Cap nhat thanh toan don hang', 'Don #B7DF122E -> Da thanh toan.', 'PAYMENT', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "b7df122e-d73a-45fa-abc5-f03e44c12c90", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 06:51:24.734592+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (253, '86bd00a2-395e-42e1-8863-2d8492c64c1d', 'Cap nhat thanh toan don hang', 'Don #B7DF122E -> Da thanh toan.', 'PAYMENT', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "b7df122e-d73a-45fa-abc5-f03e44c12c90", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 06:51:24.734688+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (254, '03f1a264-f077-44b4-96da-9de76cc75989', 'Cap nhat thanh toan don hang', 'Don #B7DF122E -> Da thanh toan.', 'PAYMENT', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "b7df122e-d73a-45fa-abc5-f03e44c12c90", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 06:51:24.734825+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (255, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Nhan tien QR thanh cong', 'Don #b7df122e-d73a-45fa-abc5-f03e44c12c90 da nhan thanh toan QR va duoc xac nhan.', 'PAYMENT', false, '{"ma_don_hang": "b7df122e-d73a-45fa-abc5-f03e44c12c90", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 06:51:24.753222+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (256, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Don hang da duoc tao', 'Don #d8b32f5f-d817-4640-8fc7-6837da6726fc da duoc tao thanh cong.', 'ORDER', false, '{"ma_don_hang": "d8b32f5f-d817-4640-8fc7-6837da6726fc", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-21 06:52:02.376572+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (257, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Co don hang moi', 'Don #D8B32F5F vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "d8b32f5f-d817-4640-8fc7-6837da6726fc", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-21 06:52:02.405797+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (258, '86bd00a2-395e-42e1-8863-2d8492c64c1d', 'Co don hang moi', 'Don #D8B32F5F vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "d8b32f5f-d817-4640-8fc7-6837da6726fc", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-21 06:52:02.440503+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (259, '03f1a264-f077-44b4-96da-9de76cc75989', 'Co don hang moi', 'Don #D8B32F5F vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "d8b32f5f-d817-4640-8fc7-6837da6726fc", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-21 06:52:02.445765+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (260, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Da tao ma QR ngan hang', 'Don #d8b32f5f-d817-4640-8fc7-6837da6726fc da san sang thanh toan qua QR.', 'PAYMENT', false, '{"ma_don_hang": "d8b32f5f-d817-4640-8fc7-6837da6726fc", "phuong_thuc_thanh_toan": "NGAN_HANG_QR"}', '2026-03-21 06:52:02.474266+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (261, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Don hang da duoc tao', 'Don #7a66ed6d-1ea2-4a43-8c57-2b08df22f292 da duoc tao thanh cong.', 'ORDER', false, '{"ma_don_hang": "7a66ed6d-1ea2-4a43-8c57-2b08df22f292", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-21 06:53:57.282458+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (262, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Co don hang moi', 'Don #7A66ED6D vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "7a66ed6d-1ea2-4a43-8c57-2b08df22f292", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-21 06:53:57.326479+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (263, '03f1a264-f077-44b4-96da-9de76cc75989', 'Co don hang moi', 'Don #7A66ED6D vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "7a66ed6d-1ea2-4a43-8c57-2b08df22f292", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-21 06:53:57.346752+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (264, '86bd00a2-395e-42e1-8863-2d8492c64c1d', 'Co don hang moi', 'Don #7A66ED6D vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "7a66ed6d-1ea2-4a43-8c57-2b08df22f292", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-21 06:53:57.355954+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (265, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Da tao ma QR ngan hang', 'Don #7a66ed6d-1ea2-4a43-8c57-2b08df22f292 da san sang thanh toan qua QR.', 'PAYMENT', false, '{"ma_don_hang": "7a66ed6d-1ea2-4a43-8c57-2b08df22f292", "phuong_thuc_thanh_toan": "NGAN_HANG_QR"}', '2026-03-21 06:53:57.367249+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (266, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Don hang da duoc tao', 'Don #e20dc8d4-4796-4e23-b881-ea20cca1b45b da duoc tao thanh cong.', 'ORDER', false, '{"ma_don_hang": "e20dc8d4-4796-4e23-b881-ea20cca1b45b", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-21 06:55:26.905286+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (267, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Co don hang moi', 'Don #E20DC8D4 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "e20dc8d4-4796-4e23-b881-ea20cca1b45b", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-21 06:55:26.927001+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (268, '03f1a264-f077-44b4-96da-9de76cc75989', 'Co don hang moi', 'Don #E20DC8D4 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "e20dc8d4-4796-4e23-b881-ea20cca1b45b", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-21 06:55:26.969362+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (269, '86bd00a2-395e-42e1-8863-2d8492c64c1d', 'Co don hang moi', 'Don #E20DC8D4 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "e20dc8d4-4796-4e23-b881-ea20cca1b45b", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-21 06:55:26.976657+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (270, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Da tao ma QR ngan hang', 'Don #e20dc8d4-4796-4e23-b881-ea20cca1b45b da san sang thanh toan qua QR.', 'PAYMENT', false, '{"ma_don_hang": "e20dc8d4-4796-4e23-b881-ea20cca1b45b", "phuong_thuc_thanh_toan": "NGAN_HANG_QR"}', '2026-03-21 06:55:26.986599+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (271, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Cap nhat trang thai don hang', 'Don #E20DC8D4 -> Da xac nhan.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "e20dc8d4-4796-4e23-b881-ea20cca1b45b", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 06:57:23.041169+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (272, '86bd00a2-395e-42e1-8863-2d8492c64c1d', 'Cap nhat trang thai don hang', 'Don #E20DC8D4 -> Da xac nhan.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "e20dc8d4-4796-4e23-b881-ea20cca1b45b", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 06:57:23.041241+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (273, '03f1a264-f077-44b4-96da-9de76cc75989', 'Cap nhat trang thai don hang', 'Don #E20DC8D4 -> Da xac nhan.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "e20dc8d4-4796-4e23-b881-ea20cca1b45b", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 06:57:23.041294+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (274, '86bd00a2-395e-42e1-8863-2d8492c64c1d', 'Cap nhat thanh toan don hang', 'Don #E20DC8D4 -> Da thanh toan.', 'PAYMENT', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "e20dc8d4-4796-4e23-b881-ea20cca1b45b", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 06:57:23.054224+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (275, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Cap nhat thanh toan don hang', 'Don #E20DC8D4 -> Da thanh toan.', 'PAYMENT', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "e20dc8d4-4796-4e23-b881-ea20cca1b45b", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 06:57:23.054192+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (276, '03f1a264-f077-44b4-96da-9de76cc75989', 'Cap nhat thanh toan don hang', 'Don #E20DC8D4 -> Da thanh toan.', 'PAYMENT', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "e20dc8d4-4796-4e23-b881-ea20cca1b45b", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 06:57:23.054392+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (277, '8c0adc4b-daa2-494c-9b58-4b1daee0ca07', 'Nhan tien QR thanh cong', 'Don #e20dc8d4-4796-4e23-b881-ea20cca1b45b da nhan thanh toan QR va duoc xac nhan.', 'PAYMENT', false, '{"ma_don_hang": "e20dc8d4-4796-4e23-b881-ea20cca1b45b", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 06:57:23.072801+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (278, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Co don hang moi', 'Don #A317CE7A vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "a317ce7a-0c16-468c-86be-f6816354ee9b", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 07:00:08.867116+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (279, '03f1a264-f077-44b4-96da-9de76cc75989', 'Co don hang moi', 'Don #A317CE7A vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "a317ce7a-0c16-468c-86be-f6816354ee9b", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 07:00:08.885205+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (280, '86bd00a2-395e-42e1-8863-2d8492c64c1d', 'Co don hang moi', 'Don #A317CE7A vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "a317ce7a-0c16-468c-86be-f6816354ee9b", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 07:00:08.885711+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (281, 'guest-pos-1774076408806', 'Cap nhat trang thai don hang', 'Don #a317ce7a-0c16-468c-86be-f6816354ee9b da chuyen sang trang thai DA_XAC_NHAN.', 'ORDER', false, '{"ma_don_hang": "a317ce7a-0c16-468c-86be-f6816354ee9b", "trang_thai_don_hang": "DA_XAC_NHAN"}', '2026-03-21 07:00:10.786032+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (282, 'guest-pos-1774076408806', 'Cap nhat trang thai don hang', 'Don #a317ce7a-0c16-468c-86be-f6816354ee9b da chuyen sang trang thai DANG_CHUAN_BI.', 'ORDER', false, '{"ma_don_hang": "a317ce7a-0c16-468c-86be-f6816354ee9b", "trang_thai_don_hang": "DANG_CHUAN_BI"}', '2026-03-21 07:00:10.829252+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (283, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Co don hang moi', 'Don #61628D99 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "61628d99-846e-4982-b12d-47c399e2695a", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-21 07:00:49.691231+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (284, '86bd00a2-395e-42e1-8863-2d8492c64c1d', 'Co don hang moi', 'Don #61628D99 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "61628d99-846e-4982-b12d-47c399e2695a", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-21 07:00:49.691282+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (285, '03f1a264-f077-44b4-96da-9de76cc75989', 'Co don hang moi', 'Don #61628D99 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "61628d99-846e-4982-b12d-47c399e2695a", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_XU_LY"}', '2026-03-21 07:00:49.691436+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (286, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Cap nhat trang thai don hang', 'Don #61628D99 -> Da xac nhan.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "61628d99-846e-4982-b12d-47c399e2695a", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 07:01:08.113855+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (287, '03f1a264-f077-44b4-96da-9de76cc75989', 'Cap nhat trang thai don hang', 'Don #61628D99 -> Da xac nhan.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "61628d99-846e-4982-b12d-47c399e2695a", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 07:01:08.132713+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (288, '86bd00a2-395e-42e1-8863-2d8492c64c1d', 'Cap nhat trang thai don hang', 'Don #61628D99 -> Da xac nhan.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "61628d99-846e-4982-b12d-47c399e2695a", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 07:01:08.134386+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (289, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Cap nhat thanh toan don hang', 'Don #61628D99 -> Da thanh toan.', 'PAYMENT', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "61628d99-846e-4982-b12d-47c399e2695a", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 07:01:08.161847+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (290, '86bd00a2-395e-42e1-8863-2d8492c64c1d', 'Cap nhat thanh toan don hang', 'Don #61628D99 -> Da thanh toan.', 'PAYMENT', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "61628d99-846e-4982-b12d-47c399e2695a", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 07:01:08.161966+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (291, '03f1a264-f077-44b4-96da-9de76cc75989', 'Cap nhat thanh toan don hang', 'Don #61628D99 -> Da thanh toan.', 'PAYMENT', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "61628d99-846e-4982-b12d-47c399e2695a", "trang_thai_don_hang": "DA_XAC_NHAN", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 07:01:08.162058+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (292, 'guest-pos-1774076449665', 'Nhan tien QR thanh cong', 'Don #61628d99-846e-4982-b12d-47c399e2695a da nhan thanh toan QR va duoc xac nhan.', 'PAYMENT', false, '{"ma_don_hang": "61628d99-846e-4982-b12d-47c399e2695a", "trang_thai_thanh_toan": "DA_THANH_TOAN"}', '2026-03-21 07:01:08.188487+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (294, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Co don hang moi', 'Don #5A69ECEB vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "5a69eceb-db45-4226-a6ad-3e5b820867e8", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 07:22:01.86406+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (296, '81c62ad4-48db-43ff-be91-3ba7f5b8b68f', 'Co don hang moi', 'Don #5A69ECEB vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "5a69eceb-db45-4226-a6ad-3e5b820867e8", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 07:22:01.864202+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (295, '86bd00a2-395e-42e1-8863-2d8492c64c1d', 'Co don hang moi', 'Don #5A69ECEB vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "5a69eceb-db45-4226-a6ad-3e5b820867e8", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 07:22:01.864158+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (297, '03f1a264-f077-44b4-96da-9de76cc75989', 'Co don hang moi', 'Don #5A69ECEB vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "5a69eceb-db45-4226-a6ad-3e5b820867e8", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 07:22:01.887503+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (300, '60e6dc26-351f-47a5-abe3-0d892272c1ab', 'Co don hang moi', 'Don #8066D8E3 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "8066d8e3-a14c-4f78-a912-491fb2b9828f", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 07:22:45.231945+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (301, '81c62ad4-48db-43ff-be91-3ba7f5b8b68f', 'Co don hang moi', 'Don #8066D8E3 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "8066d8e3-a14c-4f78-a912-491fb2b9828f", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 07:22:45.247889+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (302, '03f1a264-f077-44b4-96da-9de76cc75989', 'Co don hang moi', 'Don #8066D8E3 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "8066d8e3-a14c-4f78-a912-491fb2b9828f", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 07:22:45.255766+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (303, '86bd00a2-395e-42e1-8863-2d8492c64c1d', 'Co don hang moi', 'Don #8066D8E3 vua duoc tao.', 'ORDER', false, '{"co_so_ma": "MAC_DINH_CHI", "ma_don_hang": "8066d8e3-a14c-4f78-a912-491fb2b9828f", "trang_thai_don_hang": "MOI_TAO", "trang_thai_thanh_toan": "CHO_THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 07:22:45.256026+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (293, 'f8535c0c-4f47-483e-b7b3-f63c563af1cc', 'Don hang da duoc tao', 'Don #5a69eceb-db45-4226-a6ad-3e5b820867e8 da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "5a69eceb-db45-4226-a6ad-3e5b820867e8", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-21 07:22:01.838125+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (298, 'f8535c0c-4f47-483e-b7b3-f63c563af1cc', 'Don COD cho thu tien', 'Don #5a69eceb-db45-4226-a6ad-3e5b820867e8 se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "5a69eceb-db45-4226-a6ad-3e5b820867e8", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 07:22:01.897182+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (299, 'f8535c0c-4f47-483e-b7b3-f63c563af1cc', 'Don hang da duoc tao', 'Don #8066d8e3-a14c-4f78-a912-491fb2b9828f da duoc tao thanh cong.', 'ORDER', true, '{"ma_don_hang": "8066d8e3-a14c-4f78-a912-491fb2b9828f", "trang_thai_don_hang": "MOI_TAO"}', '2026-03-21 07:22:45.172854+00');
INSERT INTO orders.thong_bao (id, ma_nguoi_dung, tieu_de, noi_dung, loai, da_doc, du_lieu, ngay_tao) VALUES (304, 'f8535c0c-4f47-483e-b7b3-f63c563af1cc', 'Don COD cho thu tien', 'Don #8066d8e3-a14c-4f78-a912-491fb2b9828f se duoc thu tien khi giao hang.', 'PAYMENT', true, '{"ma_don_hang": "8066d8e3-a14c-4f78-a912-491fb2b9828f", "phuong_thuc_thanh_toan": "THANH_TOAN_KHI_NHAN_HANG"}', '2026-03-21 07:22:45.263607+00');


--
-- Data for Name: voucher; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.voucher (id, ma_voucher, mo_ta, loai, gia_tri, giam_toi_da, don_hang_toi_thieu, tong_luot_dung, luot_da_dung, han_su_dung, trang_thai, ngay_tao, ngay_cap_nhat) VALUES (2, 'SAVE20K', 'Giam thang 20,000d cho don tu 100,000d', 'AMOUNT', 20000.00, NULL, 100000.00, 50, 0, NULL, 'ACTIVE', '2026-03-12 17:38:13.425679', '2026-03-12 17:38:13.425679');
INSERT INTO orders.voucher (id, ma_voucher, mo_ta, loai, gia_tri, giam_toi_da, don_hang_toi_thieu, tong_luot_dung, luot_da_dung, han_su_dung, trang_thai, ngay_tao, ngay_cap_nhat) VALUES (3, 'FREESHIP', 'Giam phi giao hang 15,000d', 'AMOUNT', 15000.00, NULL, 0.00, NULL, 0, NULL, 'ACTIVE', '2026-03-12 17:38:13.425679', '2026-03-12 17:38:13.425679');
INSERT INTO orders.voucher (id, ma_voucher, mo_ta, loai, gia_tri, giam_toi_da, don_hang_toi_thieu, tong_luot_dung, luot_da_dung, han_su_dung, trang_thai, ngay_tao, ngay_cap_nhat) VALUES (1, 'WELCOME10', 'Giam 10% cho don hang dau tien', 'PERCENT', 10.00, 50000.00, 0.00, 100, 1, NULL, 'ACTIVE', '2026-03-12 17:38:13.425679', '2026-03-12 17:49:37.003667');


--
-- Data for Name: yeu_thich_san_pham; Type: TABLE DATA; Schema: orders; Owner: admin
--

INSERT INTO orders.yeu_thich_san_pham (id, ma_nguoi_dung, ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url, danh_muc, ngay_tao) VALUES (43, 'b81d9738-535e-4475-884d-aeb3b7324f01', '1', 'Cà Phê Sữa Đá', 39000, 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_da_73fed306bafb4f87b4cb44573c900388_grande.png', 'Cà phê', '2026-03-21 06:44:08.487983');
INSERT INTO orders.yeu_thich_san_pham (id, ma_nguoi_dung, ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url, danh_muc, ngay_tao) VALUES (45, 'b81d9738-535e-4475-884d-aeb3b7324f01', '2', 'Trà Đào Cam Sả', 45000, '/images/products/tra-dao-cam-sa.jpg', 'Trà', '2026-03-21 06:44:12.165615');


--
-- Name: inference_logs_id_seq; Type: SEQUENCE SET; Schema: ai; Owner: admin
--

SELECT pg_catalog.setval('ai.inference_logs_id_seq', 9, true);


--
-- Name: mo_hinh_ai_ma_mo_hinh_seq; Type: SEQUENCE SET; Schema: ai; Owner: admin
--

SELECT pg_catalog.setval('ai.mo_hinh_ai_ma_mo_hinh_seq', 56, true);


--
-- Name: model_registry_id_seq; Type: SEQUENCE SET; Schema: ai; Owner: admin
--

SELECT pg_catalog.setval('ai.model_registry_id_seq', 6, true);


--
-- Name: nhat_ky_suy_luan_ma_nhat_ky_seq; Type: SEQUENCE SET; Schema: ai; Owner: admin
--

SELECT pg_catalog.setval('ai.nhat_ky_suy_luan_ma_nhat_ky_seq', 313, true);


--
-- Name: dia_chi_giao_hang_id_seq; Type: SEQUENCE SET; Schema: identity; Owner: admin
--

SELECT pg_catalog.setval('identity.dia_chi_giao_hang_id_seq', 6, true);


--
-- Name: khuyen_mai_su_dung_id_seq; Type: SEQUENCE SET; Schema: identity; Owner: admin
--

SELECT pg_catalog.setval('identity.khuyen_mai_su_dung_id_seq', 2, true);


--
-- Name: ton_kho_san_pham_id_seq; Type: SEQUENCE SET; Schema: inventory; Owner: admin
--

SELECT pg_catalog.setval('inventory.ton_kho_san_pham_id_seq', 5, true);


--
-- Name: danh_muc_ma_danh_muc_seq; Type: SEQUENCE SET; Schema: menu; Owner: admin
--

SELECT pg_catalog.setval('menu.danh_muc_ma_danh_muc_seq', 18, true);


--
-- Name: san_pham_ma_san_pham_seq; Type: SEQUENCE SET; Schema: menu; Owner: admin
--

SELECT pg_catalog.setval('menu.san_pham_ma_san_pham_seq', 66, true);


--
-- Name: danh_muc_ma_danh_muc_seq; Type: SEQUENCE SET; Schema: menu_ci_local; Owner: admin
--

SELECT pg_catalog.setval('menu_ci_local.danh_muc_ma_danh_muc_seq', 14, true);


--
-- Name: san_pham_ma_san_pham_seq; Type: SEQUENCE SET; Schema: menu_ci_local; Owner: admin
--

SELECT pg_catalog.setval('menu_ci_local.san_pham_ma_san_pham_seq', 62, true);


--
-- Name: chat_message_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020307401; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020307401.chat_message_id_seq', 1, false);


--
-- Name: chi_tiet_don_hang_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020307401; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020307401.chi_tiet_don_hang_id_seq', 1, false);


--
-- Name: danh_gia_san_pham_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020307401; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020307401.danh_gia_san_pham_id_seq', 1, false);


--
-- Name: giao_dich_thanh_toan_ma_giao_dich_seq; Type: SEQUENCE SET; Schema: order_ci_1774020307401; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020307401.giao_dich_thanh_toan_ma_giao_dich_seq', 1, false);


--
-- Name: gio_hang_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020307401; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020307401.gio_hang_id_seq', 1, false);


--
-- Name: thong_bao_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020307401; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020307401.thong_bao_id_seq', 1, false);


--
-- Name: voucher_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020307401; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020307401.voucher_id_seq', 1, false);


--
-- Name: yeu_thich_san_pham_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020307401; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020307401.yeu_thich_san_pham_id_seq', 1, false);


--
-- Name: chat_message_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020400837; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020400837.chat_message_id_seq', 1, false);


--
-- Name: chi_tiet_don_hang_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020400837; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020400837.chi_tiet_don_hang_id_seq', 1, false);


--
-- Name: danh_gia_san_pham_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020400837; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020400837.danh_gia_san_pham_id_seq', 1, false);


--
-- Name: giao_dich_thanh_toan_ma_giao_dich_seq; Type: SEQUENCE SET; Schema: order_ci_1774020400837; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020400837.giao_dich_thanh_toan_ma_giao_dich_seq', 1, false);


--
-- Name: gio_hang_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020400837; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020400837.gio_hang_id_seq', 1, false);


--
-- Name: thong_bao_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020400837; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020400837.thong_bao_id_seq', 1, false);


--
-- Name: voucher_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020400837; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020400837.voucher_id_seq', 1, false);


--
-- Name: yeu_thich_san_pham_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020400837; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020400837.yeu_thich_san_pham_id_seq', 1, false);


--
-- Name: chat_message_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020528986; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020528986.chat_message_id_seq', 1, false);


--
-- Name: chi_tiet_don_hang_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020528986; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020528986.chi_tiet_don_hang_id_seq', 1, false);


--
-- Name: danh_gia_san_pham_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020528986; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020528986.danh_gia_san_pham_id_seq', 1, false);


--
-- Name: giao_dich_thanh_toan_ma_giao_dich_seq; Type: SEQUENCE SET; Schema: order_ci_1774020528986; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020528986.giao_dich_thanh_toan_ma_giao_dich_seq', 1, false);


--
-- Name: gio_hang_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020528986; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020528986.gio_hang_id_seq', 1, false);


--
-- Name: thong_bao_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020528986; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020528986.thong_bao_id_seq', 1, false);


--
-- Name: voucher_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020528986; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020528986.voucher_id_seq', 1, false);


--
-- Name: yeu_thich_san_pham_id_seq; Type: SEQUENCE SET; Schema: order_ci_1774020528986; Owner: admin
--

SELECT pg_catalog.setval('order_ci_1774020528986.yeu_thich_san_pham_id_seq', 1, false);


--
-- Name: chat_message_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.chat_message_id_seq', 39, true);


--
-- Name: chi_tiet_don_hang_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.chi_tiet_don_hang_id_seq', 111, true);


--
-- Name: danh_gia_san_pham_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.danh_gia_san_pham_id_seq', 7, true);


--
-- Name: giao_dich_thanh_toan_ma_giao_dich_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.giao_dich_thanh_toan_ma_giao_dich_seq', 98, true);


--
-- Name: gio_hang_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.gio_hang_id_seq', 150, true);


--
-- Name: thong_bao_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.thong_bao_id_seq', 304, true);


--
-- Name: voucher_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.voucher_id_seq', 3, true);


--
-- Name: yeu_thich_san_pham_id_seq; Type: SEQUENCE SET; Schema: orders; Owner: admin
--

SELECT pg_catalog.setval('orders.yeu_thich_san_pham_id_seq', 45, true);


--
-- Name: inference_logs inference_logs_pkey; Type: CONSTRAINT; Schema: ai; Owner: admin
--

ALTER TABLE ONLY ai.inference_logs
    ADD CONSTRAINT inference_logs_pkey PRIMARY KEY (id);


--
-- Name: mo_hinh_ai mo_hinh_ai_pkey; Type: CONSTRAINT; Schema: ai; Owner: admin
--

ALTER TABLE ONLY ai.mo_hinh_ai
    ADD CONSTRAINT mo_hinh_ai_pkey PRIMARY KEY (ma_mo_hinh);


--
-- Name: mo_hinh_ai mo_hinh_ai_ten_mo_hinh_phien_ban_key; Type: CONSTRAINT; Schema: ai; Owner: admin
--

ALTER TABLE ONLY ai.mo_hinh_ai
    ADD CONSTRAINT mo_hinh_ai_ten_mo_hinh_phien_ban_key UNIQUE (ten_mo_hinh, phien_ban);


--
-- Name: model_registry model_registry_model_name_model_version_key; Type: CONSTRAINT; Schema: ai; Owner: admin
--

ALTER TABLE ONLY ai.model_registry
    ADD CONSTRAINT model_registry_model_name_model_version_key UNIQUE (model_name, model_version);


--
-- Name: model_registry model_registry_pkey; Type: CONSTRAINT; Schema: ai; Owner: admin
--

ALTER TABLE ONLY ai.model_registry
    ADD CONSTRAINT model_registry_pkey PRIMARY KEY (id);


--
-- Name: nhat_ky_suy_luan nhat_ky_suy_luan_pkey; Type: CONSTRAINT; Schema: ai; Owner: admin
--

ALTER TABLE ONLY ai.nhat_ky_suy_luan
    ADD CONSTRAINT nhat_ky_suy_luan_pkey PRIMARY KEY (ma_nhat_ky);


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
-- Name: san_pham PK_12500fa438f405e740de57e0f8e; Type: CONSTRAINT; Schema: menu_ci_local; Owner: admin
--

ALTER TABLE ONLY menu_ci_local.san_pham
    ADD CONSTRAINT "PK_12500fa438f405e740de57e0f8e" PRIMARY KEY (ma_san_pham);


--
-- Name: danh_muc PK_e6a452a9f1b206531f8a59158e9; Type: CONSTRAINT; Schema: menu_ci_local; Owner: admin
--

ALTER TABLE ONLY menu_ci_local.danh_muc
    ADD CONSTRAINT "PK_e6a452a9f1b206531f8a59158e9" PRIMARY KEY (ma_danh_muc);


--
-- Name: articles PK_0a6e2c450d83e0b6052c2793334; Type: CONSTRAINT; Schema: news; Owner: admin
--

ALTER TABLE ONLY news.articles
    ADD CONSTRAINT "PK_0a6e2c450d83e0b6052c2793334" PRIMARY KEY (id);


--
-- Name: thong_bao PK_0598b77d7c5991cb28f43c14f4e; Type: CONSTRAINT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.thong_bao
    ADD CONSTRAINT "PK_0598b77d7c5991cb28f43c14f4e" PRIMARY KEY (id);


--
-- Name: danh_gia_san_pham PK_17c1931906d038cc3914157220a; Type: CONSTRAINT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.danh_gia_san_pham
    ADD CONSTRAINT "PK_17c1931906d038cc3914157220a" PRIMARY KEY (id);


--
-- Name: ca_doi_soat PK_17fdd7631a1659783f213195d64; Type: CONSTRAINT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.ca_doi_soat
    ADD CONSTRAINT "PK_17fdd7631a1659783f213195d64" PRIMARY KEY (ma_ca);


--
-- Name: chat_message PK_3cc0d85193aade457d3077dd06b; Type: CONSTRAINT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.chat_message
    ADD CONSTRAINT "PK_3cc0d85193aade457d3077dd06b" PRIMARY KEY (id);


--
-- Name: gio_hang PK_40a78fdbcb9b367d66290748c4a; Type: CONSTRAINT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.gio_hang
    ADD CONSTRAINT "PK_40a78fdbcb9b367d66290748c4a" PRIMARY KEY (id);


--
-- Name: chat_conversation PK_4185724cfd0d457eab0e1494374; Type: CONSTRAINT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.chat_conversation
    ADD CONSTRAINT "PK_4185724cfd0d457eab0e1494374" PRIMARY KEY (ma_hoi_thoai);


--
-- Name: voucher PK_677ae75f380e81c2f103a57ffaf; Type: CONSTRAINT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.voucher
    ADD CONSTRAINT "PK_677ae75f380e81c2f103a57ffaf" PRIMARY KEY (id);


--
-- Name: ca_lam_viec_nhan_vien PK_68405207ec37fdac07fddb016ab; Type: CONSTRAINT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.ca_lam_viec_nhan_vien
    ADD CONSTRAINT "PK_68405207ec37fdac07fddb016ab" PRIMARY KEY (ma_ca_lam_viec);


--
-- Name: yeu_thich_san_pham PK_81d00a1e1ef4928826dc76dfdd2; Type: CONSTRAINT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.yeu_thich_san_pham
    ADD CONSTRAINT "PK_81d00a1e1ef4928826dc76dfdd2" PRIMARY KEY (id);


--
-- Name: giao_dich_thanh_toan PK_b02dabd4711cbe14c063edbfa18; Type: CONSTRAINT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.giao_dich_thanh_toan
    ADD CONSTRAINT "PK_b02dabd4711cbe14c063edbfa18" PRIMARY KEY (ma_giao_dich);


--
-- Name: don_hang PK_b81d18b74cee882d3a93f9f5b01; Type: CONSTRAINT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.don_hang
    ADD CONSTRAINT "PK_b81d18b74cee882d3a93f9f5b01" PRIMARY KEY (ma_don_hang);


--
-- Name: chi_tiet_don_hang PK_d7fe4a8788051af44dbab9a6a34; Type: CONSTRAINT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.chi_tiet_don_hang
    ADD CONSTRAINT "PK_d7fe4a8788051af44dbab9a6a34" PRIMARY KEY (id);


--
-- Name: voucher UQ_307ad3ced1467c166ed716c82a6; Type: CONSTRAINT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.voucher
    ADD CONSTRAINT "UQ_307ad3ced1467c166ed716c82a6" UNIQUE (ma_voucher);


--
-- Name: giao_dich_thanh_toan UQ_82533d925a908930be234fcac00; Type: CONSTRAINT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.giao_dich_thanh_toan
    ADD CONSTRAINT "UQ_82533d925a908930be234fcac00" UNIQUE (ma_tham_chieu);


--
-- Name: yeu_thich_san_pham uq_favorite_user_product; Type: CONSTRAINT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.yeu_thich_san_pham
    ADD CONSTRAINT uq_favorite_user_product UNIQUE (ma_nguoi_dung, ma_san_pham);


--
-- Name: thong_bao PK_0598b77d7c5991cb28f43c14f4e; Type: CONSTRAINT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.thong_bao
    ADD CONSTRAINT "PK_0598b77d7c5991cb28f43c14f4e" PRIMARY KEY (id);


--
-- Name: danh_gia_san_pham PK_17c1931906d038cc3914157220a; Type: CONSTRAINT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.danh_gia_san_pham
    ADD CONSTRAINT "PK_17c1931906d038cc3914157220a" PRIMARY KEY (id);


--
-- Name: ca_doi_soat PK_17fdd7631a1659783f213195d64; Type: CONSTRAINT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.ca_doi_soat
    ADD CONSTRAINT "PK_17fdd7631a1659783f213195d64" PRIMARY KEY (ma_ca);


--
-- Name: chat_message PK_3cc0d85193aade457d3077dd06b; Type: CONSTRAINT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.chat_message
    ADD CONSTRAINT "PK_3cc0d85193aade457d3077dd06b" PRIMARY KEY (id);


--
-- Name: gio_hang PK_40a78fdbcb9b367d66290748c4a; Type: CONSTRAINT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.gio_hang
    ADD CONSTRAINT "PK_40a78fdbcb9b367d66290748c4a" PRIMARY KEY (id);


--
-- Name: chat_conversation PK_4185724cfd0d457eab0e1494374; Type: CONSTRAINT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.chat_conversation
    ADD CONSTRAINT "PK_4185724cfd0d457eab0e1494374" PRIMARY KEY (ma_hoi_thoai);


--
-- Name: voucher PK_677ae75f380e81c2f103a57ffaf; Type: CONSTRAINT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.voucher
    ADD CONSTRAINT "PK_677ae75f380e81c2f103a57ffaf" PRIMARY KEY (id);


--
-- Name: ca_lam_viec_nhan_vien PK_68405207ec37fdac07fddb016ab; Type: CONSTRAINT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.ca_lam_viec_nhan_vien
    ADD CONSTRAINT "PK_68405207ec37fdac07fddb016ab" PRIMARY KEY (ma_ca_lam_viec);


--
-- Name: yeu_thich_san_pham PK_81d00a1e1ef4928826dc76dfdd2; Type: CONSTRAINT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.yeu_thich_san_pham
    ADD CONSTRAINT "PK_81d00a1e1ef4928826dc76dfdd2" PRIMARY KEY (id);


--
-- Name: giao_dich_thanh_toan PK_b02dabd4711cbe14c063edbfa18; Type: CONSTRAINT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.giao_dich_thanh_toan
    ADD CONSTRAINT "PK_b02dabd4711cbe14c063edbfa18" PRIMARY KEY (ma_giao_dich);


--
-- Name: don_hang PK_b81d18b74cee882d3a93f9f5b01; Type: CONSTRAINT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.don_hang
    ADD CONSTRAINT "PK_b81d18b74cee882d3a93f9f5b01" PRIMARY KEY (ma_don_hang);


--
-- Name: chi_tiet_don_hang PK_d7fe4a8788051af44dbab9a6a34; Type: CONSTRAINT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.chi_tiet_don_hang
    ADD CONSTRAINT "PK_d7fe4a8788051af44dbab9a6a34" PRIMARY KEY (id);


--
-- Name: voucher UQ_307ad3ced1467c166ed716c82a6; Type: CONSTRAINT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.voucher
    ADD CONSTRAINT "UQ_307ad3ced1467c166ed716c82a6" UNIQUE (ma_voucher);


--
-- Name: giao_dich_thanh_toan UQ_82533d925a908930be234fcac00; Type: CONSTRAINT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.giao_dich_thanh_toan
    ADD CONSTRAINT "UQ_82533d925a908930be234fcac00" UNIQUE (ma_tham_chieu);


--
-- Name: yeu_thich_san_pham uq_favorite_user_product; Type: CONSTRAINT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.yeu_thich_san_pham
    ADD CONSTRAINT uq_favorite_user_product UNIQUE (ma_nguoi_dung, ma_san_pham);


--
-- Name: thong_bao PK_0598b77d7c5991cb28f43c14f4e; Type: CONSTRAINT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.thong_bao
    ADD CONSTRAINT "PK_0598b77d7c5991cb28f43c14f4e" PRIMARY KEY (id);


--
-- Name: danh_gia_san_pham PK_17c1931906d038cc3914157220a; Type: CONSTRAINT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.danh_gia_san_pham
    ADD CONSTRAINT "PK_17c1931906d038cc3914157220a" PRIMARY KEY (id);


--
-- Name: ca_doi_soat PK_17fdd7631a1659783f213195d64; Type: CONSTRAINT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.ca_doi_soat
    ADD CONSTRAINT "PK_17fdd7631a1659783f213195d64" PRIMARY KEY (ma_ca);


--
-- Name: chat_message PK_3cc0d85193aade457d3077dd06b; Type: CONSTRAINT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.chat_message
    ADD CONSTRAINT "PK_3cc0d85193aade457d3077dd06b" PRIMARY KEY (id);


--
-- Name: gio_hang PK_40a78fdbcb9b367d66290748c4a; Type: CONSTRAINT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.gio_hang
    ADD CONSTRAINT "PK_40a78fdbcb9b367d66290748c4a" PRIMARY KEY (id);


--
-- Name: chat_conversation PK_4185724cfd0d457eab0e1494374; Type: CONSTRAINT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.chat_conversation
    ADD CONSTRAINT "PK_4185724cfd0d457eab0e1494374" PRIMARY KEY (ma_hoi_thoai);


--
-- Name: voucher PK_677ae75f380e81c2f103a57ffaf; Type: CONSTRAINT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.voucher
    ADD CONSTRAINT "PK_677ae75f380e81c2f103a57ffaf" PRIMARY KEY (id);


--
-- Name: ca_lam_viec_nhan_vien PK_68405207ec37fdac07fddb016ab; Type: CONSTRAINT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.ca_lam_viec_nhan_vien
    ADD CONSTRAINT "PK_68405207ec37fdac07fddb016ab" PRIMARY KEY (ma_ca_lam_viec);


--
-- Name: yeu_thich_san_pham PK_81d00a1e1ef4928826dc76dfdd2; Type: CONSTRAINT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.yeu_thich_san_pham
    ADD CONSTRAINT "PK_81d00a1e1ef4928826dc76dfdd2" PRIMARY KEY (id);


--
-- Name: giao_dich_thanh_toan PK_b02dabd4711cbe14c063edbfa18; Type: CONSTRAINT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.giao_dich_thanh_toan
    ADD CONSTRAINT "PK_b02dabd4711cbe14c063edbfa18" PRIMARY KEY (ma_giao_dich);


--
-- Name: don_hang PK_b81d18b74cee882d3a93f9f5b01; Type: CONSTRAINT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.don_hang
    ADD CONSTRAINT "PK_b81d18b74cee882d3a93f9f5b01" PRIMARY KEY (ma_don_hang);


--
-- Name: chi_tiet_don_hang PK_d7fe4a8788051af44dbab9a6a34; Type: CONSTRAINT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.chi_tiet_don_hang
    ADD CONSTRAINT "PK_d7fe4a8788051af44dbab9a6a34" PRIMARY KEY (id);


--
-- Name: voucher UQ_307ad3ced1467c166ed716c82a6; Type: CONSTRAINT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.voucher
    ADD CONSTRAINT "UQ_307ad3ced1467c166ed716c82a6" UNIQUE (ma_voucher);


--
-- Name: giao_dich_thanh_toan UQ_82533d925a908930be234fcac00; Type: CONSTRAINT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.giao_dich_thanh_toan
    ADD CONSTRAINT "UQ_82533d925a908930be234fcac00" UNIQUE (ma_tham_chieu);


--
-- Name: yeu_thich_san_pham uq_favorite_user_product; Type: CONSTRAINT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.yeu_thich_san_pham
    ADD CONSTRAINT uq_favorite_user_product UNIQUE (ma_nguoi_dung, ma_san_pham);


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
-- Name: yeu_thich_san_pham PK_81d00a1e1ef4928826dc76dfdd2; Type: CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.yeu_thich_san_pham
    ADD CONSTRAINT "PK_81d00a1e1ef4928826dc76dfdd2" PRIMARY KEY (id);


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
-- Name: yeu_thich_san_pham uq_favorite_user_product; Type: CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.yeu_thich_san_pham
    ADD CONSTRAINT uq_favorite_user_product UNIQUE (ma_nguoi_dung, ma_san_pham);


--
-- Name: IDX_1b94b4f95399086a3b5362084e; Type: INDEX; Schema: identity; Owner: admin
--

CREATE INDEX "IDX_1b94b4f95399086a3b5362084e" ON identity.khuyen_mai_su_dung USING btree (ma_khuyen_mai, ma_nguoi_dung);


--
-- Name: dia_chi_giao_hang FK_4bf42694ca10aca6a58f3173bba; Type: FK CONSTRAINT; Schema: identity; Owner: admin
--

ALTER TABLE ONLY identity.dia_chi_giao_hang
    ADD CONSTRAINT "FK_4bf42694ca10aca6a58f3173bba" FOREIGN KEY (ma_nguoi_dung) REFERENCES identity.nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE;


--
-- Name: khuyen_mai_su_dung FK_786f8732c34a2bf1f8ce1405205; Type: FK CONSTRAINT; Schema: identity; Owner: admin
--

ALTER TABLE ONLY identity.khuyen_mai_su_dung
    ADD CONSTRAINT "FK_786f8732c34a2bf1f8ce1405205" FOREIGN KEY (ma_khuyen_mai) REFERENCES identity.khuyen_mai(ma_khuyen_mai) ON DELETE CASCADE;


--
-- Name: san_pham FK_ab26c1b5e6d62d0527e72b20def; Type: FK CONSTRAINT; Schema: menu; Owner: admin
--

ALTER TABLE ONLY menu.san_pham
    ADD CONSTRAINT "FK_ab26c1b5e6d62d0527e72b20def" FOREIGN KEY (ma_danh_muc) REFERENCES menu.danh_muc(ma_danh_muc);


--
-- Name: san_pham FK_ab26c1b5e6d62d0527e72b20def; Type: FK CONSTRAINT; Schema: menu_ci_local; Owner: admin
--

ALTER TABLE ONLY menu_ci_local.san_pham
    ADD CONSTRAINT "FK_ab26c1b5e6d62d0527e72b20def" FOREIGN KEY (ma_danh_muc) REFERENCES menu_ci_local.danh_muc(ma_danh_muc);


--
-- Name: chi_tiet_don_hang FK_6ec7e7849311b2cf931302d2bb4; Type: FK CONSTRAINT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.chi_tiet_don_hang
    ADD CONSTRAINT "FK_6ec7e7849311b2cf931302d2bb4" FOREIGN KEY (ma_don_hang) REFERENCES order_ci_1774020307401.don_hang(ma_don_hang) ON DELETE CASCADE;


--
-- Name: chat_message FK_9cacc5b110ea1bd0e9415dd805f; Type: FK CONSTRAINT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.chat_message
    ADD CONSTRAINT "FK_9cacc5b110ea1bd0e9415dd805f" FOREIGN KEY (ma_hoi_thoai) REFERENCES order_ci_1774020307401.chat_conversation(ma_hoi_thoai) ON DELETE CASCADE;


--
-- Name: giao_dich_thanh_toan FK_ffeb5cf0f700e921f6cdac43475; Type: FK CONSTRAINT; Schema: order_ci_1774020307401; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020307401.giao_dich_thanh_toan
    ADD CONSTRAINT "FK_ffeb5cf0f700e921f6cdac43475" FOREIGN KEY (ma_don_hang) REFERENCES order_ci_1774020307401.don_hang(ma_don_hang) ON DELETE CASCADE;


--
-- Name: chi_tiet_don_hang FK_6ec7e7849311b2cf931302d2bb4; Type: FK CONSTRAINT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.chi_tiet_don_hang
    ADD CONSTRAINT "FK_6ec7e7849311b2cf931302d2bb4" FOREIGN KEY (ma_don_hang) REFERENCES order_ci_1774020400837.don_hang(ma_don_hang) ON DELETE CASCADE;


--
-- Name: chat_message FK_9cacc5b110ea1bd0e9415dd805f; Type: FK CONSTRAINT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.chat_message
    ADD CONSTRAINT "FK_9cacc5b110ea1bd0e9415dd805f" FOREIGN KEY (ma_hoi_thoai) REFERENCES order_ci_1774020400837.chat_conversation(ma_hoi_thoai) ON DELETE CASCADE;


--
-- Name: giao_dich_thanh_toan FK_ffeb5cf0f700e921f6cdac43475; Type: FK CONSTRAINT; Schema: order_ci_1774020400837; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020400837.giao_dich_thanh_toan
    ADD CONSTRAINT "FK_ffeb5cf0f700e921f6cdac43475" FOREIGN KEY (ma_don_hang) REFERENCES order_ci_1774020400837.don_hang(ma_don_hang) ON DELETE CASCADE;


--
-- Name: chi_tiet_don_hang FK_6ec7e7849311b2cf931302d2bb4; Type: FK CONSTRAINT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.chi_tiet_don_hang
    ADD CONSTRAINT "FK_6ec7e7849311b2cf931302d2bb4" FOREIGN KEY (ma_don_hang) REFERENCES order_ci_1774020528986.don_hang(ma_don_hang) ON DELETE CASCADE;


--
-- Name: chat_message FK_9cacc5b110ea1bd0e9415dd805f; Type: FK CONSTRAINT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.chat_message
    ADD CONSTRAINT "FK_9cacc5b110ea1bd0e9415dd805f" FOREIGN KEY (ma_hoi_thoai) REFERENCES order_ci_1774020528986.chat_conversation(ma_hoi_thoai) ON DELETE CASCADE;


--
-- Name: giao_dich_thanh_toan FK_ffeb5cf0f700e921f6cdac43475; Type: FK CONSTRAINT; Schema: order_ci_1774020528986; Owner: admin
--

ALTER TABLE ONLY order_ci_1774020528986.giao_dich_thanh_toan
    ADD CONSTRAINT "FK_ffeb5cf0f700e921f6cdac43475" FOREIGN KEY (ma_don_hang) REFERENCES order_ci_1774020528986.don_hang(ma_don_hang) ON DELETE CASCADE;


--
-- Name: chi_tiet_don_hang FK_6ec7e7849311b2cf931302d2bb4; Type: FK CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.chi_tiet_don_hang
    ADD CONSTRAINT "FK_6ec7e7849311b2cf931302d2bb4" FOREIGN KEY (ma_don_hang) REFERENCES orders.don_hang(ma_don_hang) ON DELETE CASCADE;


--
-- Name: chat_message FK_9cacc5b110ea1bd0e9415dd805f; Type: FK CONSTRAINT; Schema: orders; Owner: admin
--

ALTER TABLE ONLY orders.chat_message
    ADD CONSTRAINT "FK_9cacc5b110ea1bd0e9415dd805f" FOREIGN KEY (ma_hoi_thoai) REFERENCES orders.chat_conversation(ma_hoi_thoai) ON DELETE CASCADE;


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

\unrestrict R5Xf5scjLd8QJkYpBqX3hnmwTDFnZxPXYl4X2lvNgWgJbelSDDe1obKQMCU28Fe

