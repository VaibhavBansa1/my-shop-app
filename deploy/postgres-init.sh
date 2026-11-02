#!/bin/sh
# Creates the two database roles and the database on first start of the Postgres container.
set -e
psql -v ON_ERROR_STOP=1 --username postgres <<SQL
create role shop_owner login password '${OWNER_DB_PASSWORD}';
create role shop_app login password '${APP_DB_PASSWORD}' nobypassrls;
create database shop owner shop_owner;
SQL
