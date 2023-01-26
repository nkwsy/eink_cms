import datetime
from collections import namedtuple
from functools import wraps
import logging
import os
from dataclasses import dataclass
from dateutil import parser

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
#
#     app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = True  # mute warnings
#
#     app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
#     return app
# create_app()
logging.basicConfig(filename='../app.log', level=logging.INFO)
logger = logging.getLogger(__name__)

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
    only_image: bool = None
    archived: bool = None

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
    target_event = CellData.query.filter_by(title=data.title).first()
    if target_event:
        target_event.title = data.title
        target_event.category = data.category
        target_event.date = data.date
        target_event.sub_text = data.sub_text
        target_event.start_time = data.start_time
        target_event.end_time = data.end_time
        target_event.url = data.url
        db.session.add(target_event)
    else:
        target_event = CellData(data)
        db.session.add(target_event)
    db.session.commit()


def _store_activity(data):
    activity = CellData.query.filter_by(title=data.title).first()
    if activity:
        activity.date = data.date
        activity.title = data.title
        activity.sub_text = data.sub_text
        activity.url = data.url
    else:
        activity = CellData(data)
        db.session.add(activity)
    db.session.commit()

def _store_callout(data):
    callout = CellData.query.filter_by(title=data.title).first()
    if callout:
        callout.date = data.date
        callout.title = data.title
        callout.sub_text = data.sub_text
        activity.url = data.url
    else:
        activity = CellData(data)
        db.session.add(activity)
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
            form = EventForm(title=banner.title, header= banner.header, sub_text=banner.sub_text,date=parser.parse(banner.date),start_time=parser.parse(banner.start_time), end_time=parser.parse(banner.end_time), url=banner.url)
            if not banner:
                print(f'Not banner: id: {bannerid, type(bannerid)}')
                abort(404)

    elif request.method == 'POST':
        print('post')

        category = 'event'
        header = request.form['header_text']
        title = request.form['title']
        sub_text = request.form['sub_text']
        date = request.form['date']
        start_time = request.form['start_time']
        end_time = request.form['end_time']
        url = request.form['url']
        print(form.data)
        event = EventClass(category=category,
                      header=header,
                      title=title,
                      sub_text=sub_text,
                      date=date,
                      start_time=start_time,
                      end_time=end_time,
                      url=url,
                      archived=False)
        print(event)
        _store_event(event)

        try:
            print('try')
            # outfile = generate_banner(banner)
        except Exception as exc:
            logger.error('Error generating banner, exc: {}'.format(exc))
            abort(400)
        return redirect(url_for('app.index'))
        # if os.path.isfile(outfile):
        #     return send_file(outfile, mimetype='image/png', cache_timeout=1)
        # else:
        #     logger.error('No output file {}'.format(outfile))
        #     abort(400)
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
            if not bannerid.isdigit():
                abort(400)
            banner = CellData.query.filter_by(id=bannerid).first()
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
        if banner.date is not None:
            non_empty_fields['date'] = parser.parse(banner.date)
        if banner.start_time is not None:
            non_empty_fields['start_time'] = parser.parse(banner.start_time)
        if banner.end_time is not None:
            non_empty_fields['end_time'] = parser.parse(banner.end_time)
        if banner.url is not None:
            non_empty_fields['url'] = banner.url
        if banner.header is not None:
            non_empty_fields['header'] = banner.header
        # start_time=parser.parse(banner.start_time),
        #                  end_time=parser.parse(banner.end_time), url=banner.url)
        print(non_empty_fields)
        form = ActivityForm(title=banner.title, sub_text=banner.sub_text, **non_empty_fields)

        # form = ActivityForm(title=banner.title, header=banner.header, sub_text=banner.sub_text,
        #                  date=parser.parse(banner.date), start_time=parser.parse(banner.start_time),
        #                  end_time=parser.parse(banner.end_time), url=banner.url)
        if not banner:
            print(f'Not banner: id: {bannerid, type(bannerid)}')
            abort(404)


    elif request.method == 'POST':
        category = 'activity'
        title = request.form['title']
        sub_text = request.form['sub_text']
        date = request.form['date']
        url = request.form['url']
        activity = EventClass(category=category,
                      title=title,
                      sub_text=sub_text,
                      date=date,
                      url=url,
                        archived=False)

        _store_activity(activity)

        return redirect(url_for('app.index'))
        # try:
        #     outfile = generate_banner(activity)
        # except Exception as exc:
        #     logger.error('Error generating banner, exc: {}'.format(exc))
        #     abort(400)

    return render_template('activityform.html', form=form)

@app.route('/callout',methods=['GET', 'POST'])
@app.route('/callout/<bannerid>', methods=['GET', 'POST'])
def callout(bannerid=None):
    form = CalloutForm()
    if request.method == 'GET':
        if bannerid:
            if not bannerid.isdigit():
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
        filename = secure_filename(form.image_file.data.filename)
        form.image_file.data.save('uploads/' + filename)
        image_file = request.form['image_file']
        only_image = request.form['only_image']
        callout = EventClass(category=category,
                      title=title,
                      sub_text=sub_text,
                      body=body,
                      url= url,
                      image_file = image_file,
                      only_image = only_image,
                        archived= False)

        _store_event(event)

        return redirect(url_for('app.index'))
        # try:
        #     outfile = generate_banner(callout)
        # except Exception as exc:
        #     logger.error('Error generating banner, exc: {}'.format(exc))
        #     abort(400)

    return render_template('calloutform.html', form=form)
# @app.route('/', methods=['GET'])
@app.route('/generate')
def gen_img():
    make_sign()
    return redirect(url_for('app.index'))

# @app.route('/<bannerid>', methods=['GET', 'POST'])
@app.route('/', methods=['GET', 'POST'])
def index(bannerid=None):
    form = _get_form()
    cached_banners = CellData.query.all()
    cached_events = CellData.query.filter_by(category='event').all()
    cached_activities = CellData.query.filter_by(category='activity').all()
    cached_callouts = CellData.query.filter_by(category='callout').all()
    for x in cached_events:
        print(x.__dict__)
    # if a get request with valid banner id prepopulate form
    if request.method == 'GET':
        print('/ get')
        if bannerid:
            if not bannerid.isdigit():
                abort(400)

            banner = Banner.query.filter_by(id=bannerid).first()
            if not banner:
                abort(404)

            form.name.data = banner.name
            form.image_url1.data = banner.image_url1
            form.image_url2.data = banner.image_url2
            form.text.data = banner.text
            form.background.data = banner.background

    # else if post request validate and generate banner image
    # elif request.method == 'POST' and form.validate():
    elif request.method == 'POST':
        print('/ post')
        name = form.name.data
        image1 = form.image_url1.data
        image2 = form.image_url2.data
        text = form.text.data
        background = form.background.data

        make_sign()
        banner = ImgBanner(name=name,
                           image1=image1,
                           image2=image2,
                           text=text,
                           background=background)

        # if session.get('logged_in'):
        _store_banner(banner)
        #
        # try:
        #     outfile = generate_banner(banner)
        # except Exception as exc:
        #     logger.error('Error generating banner, exc: {}'.format(exc))
        #     abort(400)
        #
        # if os.path.isfile(outfile):
        #     return send_file(outfile, mimetype='image/png')
        # else:
        #     logger.error('No output file {}'.format(outfile))
        #     abort(400)
    return render_template('imageform.html',
                           form=form,
                           activities=cached_activities,
                           events=cached_events,
                           callouts=cached_callouts,
                           banners=cached_banners)


# if __name__ == "__main__":
#     app.run(debug=True, port=3000)
