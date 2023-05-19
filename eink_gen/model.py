import os
import sys

from flask import Flask
from flask import current_app, g

from flask_sqlalchemy import SQLAlchemy
# from pymongo import MongoClient
from flask import current_app, g

db = SQLAlchemy()

# basedir = os.path.abspath(os.path.dirname(__file__))
#
# app = Flask(__name__)
# app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL') or \
#     'sqlite:///' + os.path.join(basedir, 'banners.db')
#
# app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = True  # mute warnings
#
# app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')



class CellData(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String())
    date = db.Column(db.String, nullable=True)
    start_time = db.Column(db.String,nullable=True)
    end_time = db.Column(db.String, nullable=True)
    title = db.Column(db.String())
    header = db.Column(db.String())
    sub_text = db.Column(db.String())
    body = db.Column(db.String())
    url = db.Column(db.String())
    only_image = db.Column(db.Boolean())
    archived = db.Column(db.Boolean())
    image_file = db.Column(db.String())


    def __init__(self, banner):
        self.category = banner.category
        self.date = banner.date
        self.start_time = banner.start_time
        self.end_time = banner.end_time
        self.title = banner.title
        self.header = banner.header
        self.sub_text = banner.sub_text
        self.body = banner.body
        self.url = banner.url
        self.only_image = banner.only_image
        self.archived = banner.archived
        self.image_file = banner.image_file
    # def new_event(self, banner):
    #     self.category = banner.category
    #     self.date = banner.date
    #     self.start_time = banner.start_time
    #     self.end_time = banner.end_time
    #     self.title = banner.title
    #     self.sub_text = banner.sub_text
    #     self.url = banner.url
    #     self.archived = banner.archived

    def __repr__(self):
        return '<CellData %r>' % self.id
class Banner(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))  # for caching banners
    image_url1 = db.Column(db.String(100))  # from dropdown
    image_url2 = db.Column(db.String(500))  # image URL
    text = db.Column(db.String(500))
    background = db.Column(db.Boolean)
    # type = db.Column(db.String())
    # start_time = db.Column(db.DateTime)
    # end_time = db.Column(db.DateTime)
    # title = db.Column(db.String())
    # sub_text = db.Column(db.String())
    # category = db.Column(db.String())
    # url = db.Column(db.String())
    # body = db.Column(db.String())


    def __init__(self, banner):
        self.name = banner.name
        self.image_url1 = banner.image1
        self.image_url2 = banner.image2
        self.text = banner.text
        self.background = banner.background

    def __repr__(self):
        return '<Banner %r>' % self.name


if __name__ == '__main__':

    # TODOs: use a migration tool like Alembic
    # make User model if more people are interested

    if len(sys.argv) > 1 and '-r' in sys.argv[1]:

        print('You are about to recreate the DB, all data will be lost!')
        confirm = input('Are you sure? ')

        if str(confirm).lower()[0] == 'y':
            db.drop_all()
            print('Running drop_all')
        else:
            print('Skipping drop_all')

    print('Running create_all')
    db.create_all()
