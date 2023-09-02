import datetime
from collections import namedtuple
from functools import wraps
# from loguru import logging
import os
from dataclasses import dataclass
from dateutil import parser
from uuid import UUID, uuid4
from flask import abort, render_template, flash, redirect, Blueprint
from flask import request, session, url_for
from werkzeug.utils import secure_filename
from eink_gen.forms import ImageForm, get_logos, ActivityForm, CalloutForm, EventForm, UploadForm
from eink_gen.model import db, Banner, CellData

from eink_gen.banner.banner import generate_banner, generate_cell 

import boto3
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Retrieve environment variables
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_S3_BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME")

# Initialize boto3 client
s3_client = boto3.client(
    "s3",
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
)

def upload_file_to_s3(file_path, object_name=None):
    """Upload a file to an S3 bucket.
    Parameters:
        file_path (str): File to upload
        object_name (str): S3 object name. If not specified then file_path is used.
    """
    if object_name is None:
        object_name = file_path

    try:
        # Upload the file
        s3_client.upload_file(file_path, AWS_S3_BUCKET_NAME, object_name)
        print(f"Successfully uploaded {file_path} to {AWS_S3_BUCKET_NAME}/{object_name}")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    # Replace 'your_file.txt' with the file you want to upload to the S3 bucket
    upload_file_to_s3("your_file.txt")


app = Blueprint('app', __name__, template_folder="eink_gen")
basedir = os.path.abspath(os.path.dirname(__file__))

# def create_app():
#     app = Flask(__name__)
#     app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL') or \
#                                         'sqlite:///' + os.path.join(basedir, 'banners.db')
#
#     app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = True  # mute warnings
#
#     app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
#     return app
# create_app()
# logger = logging.getLogger(__name__)

PYBITES_SUBDIR = 'pybites'

@dataclass
class EventClass:
    category: str = None
    date: datetime.datetime = None
    start_time: datetime.datetime = None
    end_time: datetime.datetime = None
    title: str = None
    header: str = None
    sub_text: str = None
    body: str = None
    url: str = None
    only_image: int = None
    archived: bool = None
    image_file: str = None
    id: int = None
    # uuid: UUID = uuid4()


ImgBanner =  namedtuple('Banner', 'name image1 image2 text background')
Event = namedtuple('Event', 'category header title sub_text date start_time end_time url archived body', defaults=(None,))
Activity = namedtuple('Event', 'category title sub_text start_time end_time url archived')
Callout = namedtuple('Event', 'category header title sub_text start_time end_time url archived')

def make_sign():
    sign_data = []
    cached_events = CellData.query.filter_by(category='event').limit(3).all()
    cached_activities = CellData.query.filter_by(category='activity').limit(3).all()
    cached_callouts = CellData.query.filter_by(category='callout').limit(1).all()
    for x in cached_events:
        sign_data.append(x.__dict__)
    for x in cached_activities:
        sign_data.append(x.__dict__)
    for x in cached_callouts:
        sign_data.append(x.__dict__)
    return generate_banner(sign_data)

def make_cell(id):
    activity_data = []
    cached_cell = CellData.query.filter_by(id=id).first()
    return generate_cell(cached_cell.__dict__)

def login_required(test):
    '''From RealPython Flask course'''
    @wraps(test)
    def wrap(*args, **kwargs):
        if session.get('logged_in'):
            return test(*args, **kwargs)
        else:
            flash('You need to log in first')
            return redirect(url_for('app.login'))
    return wrap


def _store_banner(data):
    banner = Banner.query.filter_by(name=data.name).first()
    # if banner in db, update record, if not add it
    if banner:
        banner.name = data.name
        banner.image_url1 = data.image1
        banner.image_url2 = data.image2
        banner.text = data.text
        banner.background = data.background
    else:
        banner = Banner(data)
        db.session.add(banner)
    db.session.commit()

def _store_event(data):
    target_event = CellData.query.filter_by(id=data.id).first()
    if target_event:
        print(f'updating {target_event}')
        target_event.id = target_event.id
        target_event.title = data.title
        target_event.category = data.category
        target_event.date = data.date
        target_event.sub_text = data.sub_text
        target_event.start_time = data.start_time
        target_event.end_time = data.end_time
        target_event.url = data.url
        target_event.image_file = data.image_file
        target_event.only_image = data.only_image
        # db.session.add(target_event)
    else:
        target_event = CellData(data)
        db.session.add(target_event)
        db.session.commit()
        target_event.slug = str(target_event.id)
        return target_event.slug
    db.session.commit()
    return str(target_event.id)


def _store_activity(data):
    print(f'data: {data}')
    activity = CellData.query.filter_by(id=data.id).first()
    print(f'activity: {activity}')
    if activity:
        activity.id = activity.id
        activity.date = data.date
        activity.title = data.title
        activity.sub_text = data.sub_text
        activity.url = data.url
        activity.image_file = data.image_file
        activity.only_image = data.only_image
    else:
        activity = CellData(data)
        db.session.add(activity)
        db.session.commit()
        activity.slug = str(activity.id)
        print(f'new: {activity.slug}')
        db.session.commit()
        return activity.slug
    db.session.commit()
    return str(activity.id)

def _store_callout(data):
    callout = CellData.query.filter_by(id=data.id).first()
    if callout:
        callout.id = callout.id
        callout.date = data.date
        callout.title = data.title
        callout.sub_text = data.sub_text
        callout.url = data.url
        callout.image_file = data.image_file
        callout.only_image = data.only_image

    else:
        callout = CellData(data)
        db.session.add(callout)
        db.session.commit()
        callout.slug = str(callout.id)
        return callout.slug
    db.session.commit()
    return str(callout.id)

def _store_upload(data):
    ul = CellData(data)
    db.session.add(ul)
    db.session.commit()
@app.route('/login', methods=['GET', 'POST'])
def login():
    user = None
    status_code = 200
    if request.method == 'POST':
        user = request.form.get('username')
        password = request.form.get('password')
        if user != os.getenv('USER') or password != os.getenv('PASSWORD'):
            flash('Invalid credentials')
            status_code = 401
        else:
            session['logged_in'] = user
            return redirect(url_for('app.index'))
    return render_template('login.html', user=user), status_code


def _get_form():
    '''Get form. Logged out = python logo, logged in pybites logos'''
    form = ImageForm(request.form)
    # https://stackoverflow.com/a/16392248
    if session.get('logged_in'):
        logos = get_logos(subdir=PYBITES_SUBDIR)
        form.image_url1.choices = logos

    return form


@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    return redirect(url_for('app.index'))

@app.route('/event', methods=['GET', 'POST'])
@app.route('/event/edit/<bannerid>', methods=['GET', 'POST'])
def event(bannerid=None):
    form = EventForm()
    if request.method == 'GET':
        print('get')
        if bannerid:
            if not bannerid.isdigit():
                print('Bannerid is not digit')
                abort(400)
            bannerid = int(bannerid)
            banner = CellData.query.filter_by(id=int(bannerid)).first()
            print(banner.title)
            form = EventForm(title=banner.title, header_text= banner.header, sub_text=banner.sub_text,date=parser.parse(banner.date),start_time=parser.parse(banner.start_time), end_time=parser.parse(banner.end_time), url=banner.url)
            if not banner:
                print(f'Not banner: id: {bannerid, type(bannerid)}')
                abort(404)


    elif request.method == 'POST':
        print('post')
        category = 'event'
        id = request.form['id']
        header = request.form['header_text']
        title = request.form['title']
        sub_text = request.form['sub_text']
        date = request.form['date']
        start_time = request.form['start_time']
        end_time = request.form['end_time']
        url = request.form['url']
        print(form.data)
        event = EventClass(id=id,
                        category=category,
                      header=header,
                      title=title,
                      sub_text=sub_text,
                      date=date,
                      start_time=start_time,
                      end_time=end_time,
                      url=url,
                      archived=False)
        print(event)
        bannerid = _store_event(event)
        make_cell(int(bannerid))
        if "save" in request.form:
            print('save')
            return redirect(url_for('app.event', bannerid=bannerid))
        return redirect(url_for('app.index'))
    return render_template('eventform.html', form=form)

@app.route('/event/archive', methods=['GET', 'POST'])
@app.route('/event/archive/<bannerid>', methods=['GET', 'POST'])
def archive_event(bannerid=None):
    form = EventForm()
    if request.method == 'GET':
        print('archive event')
        if bannerid:
            if not bannerid.isdigit():
                abort(400)
            banner = CellData.query.filter_by(id=bannerid).first()
            print(banner,bannerid)
            if not banner:
                abort(404)
            db.session.delete(banner)
            db.session.commit()
    return redirect(url_for('app.index'))
@app.route('/event/delete/<bannerid>', methods=['GET', 'POST'])
def delete_event(bannerid=None):
    form = EventForm()
    if request.method == 'GET':
        print('get')
        if bannerid:
            banner = CellData.query.filter_by(id=int(bannerid)).first()
            if not banner:
                abort(404)
            db.session.delete(banner)
            db.session.commit()
            return redirect(url_for('app.index'))


@app.route('/activity', methods=['GET', 'POST'])
@app.route('/activity/edit/<bannerid>', methods=['GET', 'POST'])
def activity(bannerid=None):
    form = ActivityForm()
    if bannerid:
        if not bannerid.isdigit():
            print('Bannerid is not digit')
            abort(400)
        bannerid = int(bannerid)
        banner = CellData.query.filter_by(id=int(bannerid)).first()
        print(banner.title)
        banner_data = EventClass(title=banner.title, header=banner.header, sub_text=banner.sub_text,
                         date=banner.date)
        dates = [banner.date, banner.start_time, banner.end_time]
        non_empty_fields = {}
        non_empty_fields['id'] = int(banner.id)
        print(type(banner.date))
        if banner.date:
            non_empty_fields['date'] = parser.parse(banner.date)
        if banner.start_time:
            non_empty_fields['start_time'] = parser.parse(banner.start_time)
        if banner.end_time:
            non_empty_fields['end_time'] = parser.parse(banner.end_time)
        if banner.url:
            non_empty_fields['url'] = banner.url
        if banner.header:
            non_empty_fields['header'] = banner.header
        print(non_empty_fields)
        form = ActivityForm(title=banner.title, sub_text=banner.sub_text, **non_empty_fields)
        # form = ActivityForm(title=banner.title, header=banner.header, sub_text=banner.sub_text,
        #                  date=parser.parse(banner.date), start_time=parser.parse(banner.start_time),
        #                  end_time=parser.parse(banner.end_time), url=banner.url)
        if not banner:
            print(f'Not banner: id: {bannerid, type(bannerid)}')
            abort(404)


    if request.method == 'POST':
        id = request.form['id']
        category = 'activity'
        title = request.form['title']
        sub_text = request.form['sub_text']
        date = request.form['date']
        url = request.form['url']
        activity = EventClass(id=id,
                        category=category,
                      title=title,
                      sub_text=sub_text,
                      date=date,
                      url=url,
                        archived=False)
        bannerid = _store_activity(activity)
        make_cell(int(bannerid))
        if "save" in request.form:
            print('save')
            return redirect(url_for('app.activity', bannerid=bannerid))
        return redirect(url_for('app.index'))
    return render_template('activityform.html', form=form)


@app.route('/callout/archive', methods=['GET', 'POST'])
@app.route('/callout/archive/<bannerid>', methods=['GET', 'POST'])
def archive_callout(bannerid=None):
    form = CalloutForm()
    if request.method == 'GET':
        print('archive callout')
        if bannerid:
            if not bannerid.isdigit():
                abort(400)
            banner = CellData.query.filter_by(id=bannerid).first()
            print(banner,bannerid)
            if not banner:
                abort(404)
            db.session.delete(banner)
            db.session.commit()
    return redirect(url_for('app.index'))

@app.route('/callout/delete/<bannerid>', methods=['GET', 'POST'])
def delete_callout(bannerid=None):
    form = CalloutForm()
    if request.method == 'GET':
        print('get')
        if bannerid:
            if not bannerid.isdigit():
                print('Bannerid is not digit')
                abort(400)
            banner = CellData.query.filter_by(id=bannerid).first()
            if not banner:
                abort(404)
            db.session.delete(banner)
            db.session.commit()
            return redirect(url_for('app.index'))



@app.route('/callout', methods=['GET', 'POST'])
@app.route('/callout/edit/<bannerid>', methods=['GET', 'POST'])
def callout(bannerid=None):
    form = CalloutForm()
    if request.method == 'GET':
        if bannerid:
            if not bannerid.isdigit():
                print('Bannerid is not digit')
                abort(400)
            banner = Banner.query.filter_by(id=bannerid).first()
            if not banner:
                abort(404)

    elif request.method == 'POST':
        category = 'callout'
        title = request.form['title']
        sub_text = request.form['sub_text']
        body = request.form['body']
        url = request.form['url']
        print(f'{request.form}')
        only_image = request.form['only_image']
        image_file = request.files['image_file']
        if image_file:
            f = form.image_file.data
            filename = secure_filename(f.filename)
            f.save(os.path.join(os.path.join(basedir, 'banner/assets/images'), filename))
            f.save(os.path.join(os.path.join(basedir, 'banner/assets/images/archive'), f'callout_{datetime.datetime.now().strftime("%Y%m%d")}_{filename}'))
            # f.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            # image_file.save(filename)
        else:
            filename = None
        # form.image_file.data.save('uploads/' + filename)
        callout = EventClass(category=category,
                      title=title,
                      sub_text=sub_text,
                      body=body,
                      url= url,
                      image_file = filename,
                      only_image = int(only_image),
                        archived= False)
        bannerid = _store_callout(callout)
        make_cell(int(bannerid))
        if "save" in request.form:
            print('save')
            return redirect(url_for('app.callout', bannerid=bannerid))
        return redirect(url_for('app.index'))
    return render_template('calloutform.html', form=form)

@app.route('/upload',methods=['GET', 'POST'])
def upload():
    form = UploadForm()
    # if request.method == 'GET':
        #TODO: get all old signs and display them. Allow user to choose to use an old one
        # banner = Banner.query.filter_by(category=)
        # if not banner:
        #     abort(404)

    # elif request.method == 'POST':
    if request.method == 'POST':
        category = 'upload'
        image_file = request.files['image_file']
        if image_file:
            f = form.image_file.data
            filename = secure_filename(f.filename)
            f.save(os.path.join(os.path.join(basedir, 'static/'), 'out.jpg'))
            f.save(os.path.join(os.path.join(basedir, 'banner/assets/images/archive/displays'), f'out_{datetime.datetime.now().strftime("%Y%m%d")}_{filename}'))
            # f.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            # image_file.save(filename)
        else:
            filename = None
        # form.image_file.data.save('uploads/' + filename)
        upload = EventClass(category=category,
                      image_file = filename,
                        archived= False)

        _store_upload(upload)

        return redirect(url_for('app.index'))
    return render_template('uploadform.html', form=form) 

# Store banner / generate
# @app.route('/', methods=['GET'])
@app.route('/generate')
def gen_img():
    make_sign()
    return redirect(url_for('app.index'))

@app.route('/deploy/<display_id>')
def deploy(display_id):
    file_path = 'static/out.jpg'
    upload_file_to_s3(file_path,'out.jpg')
    return redirect(url_for('app.index'))

# @app.route('/<bannerid>', methods=['GET', 'POST'])
@app.route('/', methods=['GET', 'POST'])
def index(bannerid=None):
    form = _get_form()
    # cached_banners = CellData.query.all()
    cached_events = CellData.query.filter_by(category='event').all()
    cached_activities = CellData.query.filter_by(category='activity').all()
    cached_callouts = CellData.query.filter_by(category='callout').all()
    for x in cached_callouts:
        print(x.__dict__)
    # if a get request with valid banner id prepopulate form
    if request.method == 'GET':
        print('/ get')
        return render_template('imageform.html',
                           form=form,
                           activities=cached_activities,
                           events=cached_events,
                           callouts=cached_callouts)
