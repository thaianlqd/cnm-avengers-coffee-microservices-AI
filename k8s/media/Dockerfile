FROM busybox:1.37 AS media
# Named build contexts contain only existing public media, never the repository/.env.
COPY --from=menu_media / /media/products/
COPY --from=news_media / /media/uploads/
