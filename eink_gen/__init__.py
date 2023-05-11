import os
from loguru import logger
logger.add("app.log", rotation="10 MB") 
from flask import Flask
from flask_sqlalchemy import SQLAlchemy

basedir = os.path.abspath(os.path.dirname(__file__))
def create_app():
    app = Flask(__name__)
    print(basedir)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL') or \
                                            'sqlite:///' + os.path.join(basedir, 'banners.db')

    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = True  # mute warnings

    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
    from eink_gen.model import db
    db.init_app(app)

    from eink_gen import views
    app.register_blueprint(views.app)
    return app
