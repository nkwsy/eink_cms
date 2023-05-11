from collections import namedtuple
import os
import textwrap
import time
from PIL import Image, ImageDraw, ImageFont
import qrcode
import requests
from datetime import datetime
from dateutil import parser
from dataclasses import dataclass
from flask import abort, render_template, flash, redirect, Blueprint

from flask import request, session, url_for
from werkzeug.utils import secure_filename
from eink_gen.forms import ImageForm, get_logos, ActivityForm, CalloutForm, EventForm
from eink_gen.model import db, Banner, CellData

from eink_gen.banner.banner import generate_banner

app = Blueprint('app', __name__, template_folder="eink_gen")
basedir = os.path.abspath(os.path.dirname(__file__))

# def create_app():
#     app = Flask(__name__)
#     app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL') or \
#                                         'sqlite:///' + os.path.join(basedir, 'banners.db')

#     app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = True  # mute warnings

#     app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
#     return app
# create_app()
# logging.basicConfig(filename='../app.log', level=logging.INFO)
# logger = logging.getLogger(__name__)

if __name__ == "__main__":
    app.run(debug=True)