create extension if not exists pgcrypto;

create type public.app_role as enum ('CUSTOMER', 'VENDOR', 'RIDER', 'ADMIN', 'SUPER_ADMIN');
create type public.vendor_status as enum ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');
create type public.listing_status as enum ('PENDING_REVIEW', 'PUBLISHED', 'SOLD', 'REMOVED', 'REJECTED');
create type public.listing_condition as enum ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR');
create type public.price_type as enum ('FIXED', 'STARTING_FROM', 'QUOTE');
create type public.service_delivery_type as enum ('PICKUP', 'DELIVERY', 'IN_PERSON');
create type public.service_request_status as enum ('SUBMITTED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED');
create type public.cart_status as enum ('ACTIVE', 'CHECKED_OUT', 'ABANDONED');
create type public.order_type as enum ('FOOD', 'SHOPPING');
create type public.order_status as enum ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');
create type public.payment_method as enum ('CASH_ON_DELIVERY', 'CARD', 'BANK_TRANSFER');
create type public.payment_status as enum ('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');
create type public.delivery_task_type as enum ('DELIVERY', 'VENDOR_PICKUP', 'ERRAND');
create type public.delivery_status as enum ('REQUESTED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');
create type public.notification_type as enum ('ORDER_UPDATE', 'SERVICE_UPDATE', 'DELIVERY_UPDATE', 'MARKETPLACE_UPDATE', 'SYSTEM');
create type public.address_label as enum ('HOME', 'HOSTEL', 'OFFICE', 'OTHER');
