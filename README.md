# eink_cms
`flask --app eink_gen run`
http://127.0.0.1:5000/

gunicorn -w 4 -b 0.0.0.0 'eink_gen:create_app()'