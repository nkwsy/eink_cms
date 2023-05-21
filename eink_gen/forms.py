import glob
import os

from flask_wtf import FlaskForm
from flask_wtf.file import FileField, FileRequired

from wtforms import Form, BooleanField, StringField, DateTimeField, DateField, TimeField, URLField, SubmitField, HiddenField
from wtforms import SelectField, TextAreaField, validators
from wtforms.validators import DataRequired, Length, Email, EqualTo

EXTENSION = '.png'


def get_basename(img):
    return os.path.splitext(os.path.basename(img))[0]


def get_logos(subdir='python'):
    logos = glob.glob(os.path.join('banner/assets', subdir, '*' + EXTENSION))
    return [(logo, get_basename(logo)) for logo in logos]

DEFAULT_LOGOS = get_logos()

class EventForm(FlaskForm):
    id = HiddenField('id', default=None)
    header_text = StringField('Header')
    title = StringField('Title', validators=[Length(max=35)])
    sub_text = StringField('Subtext')
    date = DateField('Event Start', default=None,  validators = [DataRequired()])
    start_time = TimeField('Start Time', default=None)
    end_time = TimeField('End Time', default=None)
    url = URLField('URL')
    image_file = FileField('Image File')
    only_image = SelectField('Use image as whole box',choices=[(0,'False'),(1,'True')])
    submit = SubmitField('Submit')

class ActivityForm(FlaskForm):
    id = HiddenField('id', default=None)
    title = StringField('Title')
    sub_text = TextAreaField('Subtext')
    url = URLField('Url', default=None)
    date = DateField('Event Start', default=None)
    start_time = TimeField('Start Time', default=None)
    end_time = TimeField('End Time', default=None)
    image_file = FileField('Image File')
    only_image = SelectField('Use image as whole box',choices=[(0,'False'),(1,'True')])
 
class CalloutForm(FlaskForm):
    id = HiddenField('id', default=None)
    title = StringField('Title')
    sub_text = StringField('Callout Header')
    body = StringField('Body')
    url = URLField('URL')
    image_file = FileField('Image File')
    only_image = SelectField('Use image as whole box',choices=[(1,'True'),(0,'False')])
    # only_image = BooleanField('Use image as whole box', default=False)
class UploadForm(FlaskForm):
    image_file = FileField('Image File', validators=[FileRequired()])
    submit = SubmitField('Submit')

class ImageForm(Form):
    name = StringField('Banner Name', [
        validators.DataRequired(),
        validators.Length(max=100)
    ])
    image_url1 = SelectField(
        'Pick a Logo',
        choices=DEFAULT_LOGOS
    )
    image_url2 = StringField('Second Image URL', [
        validators.DataRequired(),
        validators.Length(max=500)
    ])
    text = TextAreaField('Text for Banner', [
        validators.DataRequired(),
        validators.Length(max=500)
    ])
    background = BooleanField('Use Second Image as Background?', default=True)
