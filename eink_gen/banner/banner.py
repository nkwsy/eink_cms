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
# 33.68
# 18.94
# 160

"""
JPEG settings
"""
jpeg_quality = 95
jpeg_optimize = True
dpi = (2560,1440)
jpeg_params = {'quality':jpeg_quality,'optimize':jpeg_optimize}
"""
Box settings
"""

box_1 = {'loc':1,'x':6,'y':9,'boarders':{'bottom':10,'right':14}}
box_2 = {'loc':2,'x':12,'y':9,'boarders':{'left':14,'right':14,'bottom':10}}
box_3 = {'loc':3, 'x':14,'y':9,'boarders':{'left':14,'bottom':10}}
box_4= {'loc':4, 'x':12,'y':2.25,'boarders':{'left':14,'bottom':10}}

#boarders 10, 5
boarder_s = 5
boarder_l = 10
GRID_SIZE=80

"""
Fonts

HouschkaPro-
"""
base_folder = 'eink_gen/banner/'
font_folder = f"{base_folder}assets/fonts"
base_font = "HouschkaPro-"
bold_font = os.path.join(font_folder,f"{base_font}Bold.ttf")
demiBold_font = os.path.join(font_folder,f"{base_font}DemiBold.ttf")
extraBold_font = os.path.join(font_folder,f"{base_font}ExtraBold.ttf")
medium_font = os.path.join(font_folder,f"{base_font}Medium.ttf")
# bold_font = ImageFont.truetype(f"assets/fonts/{base_font}Bold.ttf",60)

H1= {'size':26,'height':56,'spacing':53}
H2 = {'size':21,'height':49,'spacing':33}
P = {'size':8,'height':30,'spacing':4}


Font_style = namedtuple('Size', 'p H1 H2 H3 H4 H5 H6')
base_size = 16
font_scale = 1.25
def font_size(size):
    return int(base_size * pow(font_scale, size))




date_size = 68
# 16	42
# 13	37
# 10	33
# 8	30
#aspect 16:9 ratio
ASSET_DIR = f'{base_folder}assets'
DEFAULT_WIDTH = 2560
DEFAULT_HEIGHT = 1440
DEFAULT_CANVAS_SIZE = (DEFAULT_WIDTH, DEFAULT_HEIGHT)
DEFAULT_OUTPUT_FILE = 'out.jpg'
RESIZE_PERCENTAGE = 0.8
DEFAULT_TOP_MARGIN = int(((1 - 0.8) * DEFAULT_HEIGHT) / 2)
IMAGES = f'{base_folder}assets/images'
OUTPUT_IMAGES = f'{base_folder}images'
OUTPUT_STATIC = f'eink_gen/static'
WHITE, BLACK = (255), ( 0)
# WHITE, BLACK = (255, 255, 255), (0, 0, 0)
WHITE_TRANSPARENT_OVERLAY = (255, 255, 255, 178)
TEXT_FONT_TYPE = os.path.join(ASSET_DIR, 'SourceSansPro-Regular.otf')
TEXT_PADDING_HOR = 10
Y_TEXT_START = 20

# adjust CHARS_PER_LINE if you change TEXT_SIZE
TEXT_SIZE = 24
CHARS_PER_LINE = 30

# Font = namedtuple('Font', ' text ttf color size offset anchor align')
ImageDetails = namedtuple('Image', 'left top size')

@dataclass
class Font:
    text: str = None
    ttf: str = None
    color: str = None
    size: str = None
    offset: str = None
    anchor: str = None
    align: str = None

###Title font
title_font = {'ttf' : demiBold_font, 'color':WHITE, 'size':font_size(8), 'offset':None, 'anchor':'mm'}
header_font = {'ttf' : medium_font, 'color':WHITE, 'size':font_size(4), 'offset':None, 'anchor':'mb'}
event_title_font = {'ttf' : demiBold_font, 'color':WHITE, 'size':font_size(5), 'offset':None, 'anchor':'mt'}
sub_text_font = {'ttf' : medium_font, 'color':WHITE, 'size':font_size(2), 'offset':None, 'anchor':'mt'}


callout_title_font = {'ttf' : demiBold_font, 'color':WHITE, 'size':font_size(8), 'offset':None, 'anchor':'lt'}
callout_header_font = {'ttf' : medium_font, 'color':WHITE, 'size':font_size(6), 'offset':None, 'anchor':'lt'}
callout_body_font = {'ttf' : medium_font, 'color':WHITE, 'size':font_size(5), 'offset':None, 'anchor':'lt'}

action_header_font = {'ttf' : medium_font, 'color':WHITE, 'size':font_size(4), 'offset':None, 'anchor':'lb'}
action_title_font = {'ttf' : bold_font, 'color':WHITE, 'size':font_size(6), 'offset':None, 'anchor':'lt','align': 'left'}
action_text_font = {'ttf' : medium_font, 'color':WHITE, 'size':font_size(2), 'offset':None, 'anchor':'lt', 'align':'left'}
"""
Grid size
80 px box
32x18
box_params = {
    loc:tupple(x int,y int)
    size:tupple(x int,y int)
    borders:{top:px,bottom:px,left:px,right:px}
    }
group_params = {
    x: topRightCorner
    y: topRightCorner
    quantity: int
    direction: x or y
    outside_boarder:{top:px,bottom:px,left:px,right:px}
    }
line
"""

events_group = {'name': 'events_group' ,'x':14,'y':10.25,'quantity':3}
rules = {'name':'rules', 'loc':(0,0),'size':(6,9)}
welcome ={'name':'rules', 'loc':(6,0),'size':(12,9)}
facts = {'name':'facts', 'loc':(18,0),'size':(14,9)}
event_title = {'name':'event_title', 'loc':(0,9), 'size':(12,2.25)}
event_1 = {'name':'event_1', 'loc':(0,11.25), 'size':(12,2.25)}
event_2 = {'name':'event_2','loc':(0,13.5), 'size':(12,2.25)}
event_3 = {'name':'event_3','loc':(0,15.75), 'size':(12,2.25)}
action_title = {'name':'action_title','loc':(12,9), 'size':(9,2.25)}
action_1 = {'name':'action_1','loc':(12,11.25),'size':(9,2.25)}
action_2 = {'name':'action_2','loc':(12,13.5),'size':(9,2.25)}
action_3 = {'name':'action_3', 'loc':(12,15.75),'size':(9,2.25)}
callout = {'name':'callout', 'loc':(21,9), 'size':(11,4.5)}
get_involved = {'name':'get_involved','loc':(21,9),'size':(11,4.5)}
data_box_small = {'name':'data_box', 'loc':(21,13.5), 'size':(7.5,4.5)}
data_box = {'name':'data_box', 'loc':(21,13.5), 'size':(11,4.5)}

top_boxes = [rules,welcome]
mid_line = [event_title,action_title,callout,get_involved,data_box]
events = [event_title,event_1,event_2,event_3]
events_items = [event_1,event_2,event_3]
action = [action_title,action_1,action_2,action_3]
activity_items = [action_1,action_2,action_3]
all_boxes = [data_box,rules,welcome,facts, get_involved, callout,event_title,event_1,event_2,event_3,action_title,action_1,action_2,action_3]

date_center_margin = 70
time_left_margin = 140
date_box_margin = (24, 10)
date_box = (120, 172)
month_margin = 8
day_of_month_margin = 16
# day_of_month_center = (0.07, 0.75)
day_of_month_center = (date_center_margin, 0.75)
# day_center = (0.07, 0.25)
day_center = (date_center_margin, 0.25)
# month_center = (0.07, 0.80)
month_center = (date_center_margin, 0.80)
# time_start_center = (0.135, 0.75)
time_start_center = (time_left_margin, 0.75)
# time_end_center = (0.135, 0.80)
time_end_center = (time_left_margin, 0.80)
title_text_left = (20, 20)
sub_text_left = (20, 20)
time_box = (136, 62)
time_box_top_margin = 96
time_box_left_margin = 16
date_box_left_margin = 85
callout_header = (60,60)
callout_title = (600,180)
callout_body = (600,180)


def offset_position(current_positon, offset_position):
    """Offsets by number"""
    rel_x = current_positon[0] + offset_position[0]
    rel_y = current_positon[1] + offset_position[1]
    return (rel_x, rel_y)

def scale(values):
    scaled = []
    if type(values) == list:
        for value in values:
            scaled.append((int(value[0] * GRID_SIZE), int(value[1] * GRID_SIZE)))
        return scaled
    else:
        return (int(values[0] * GRID_SIZE),int(values[1] * GRID_SIZE))
for box in all_boxes:
    box['loc'] = scale(box['loc'])
    box['size'] = scale(box['size'])
class Banner:
    def __init__(self, size=DEFAULT_CANVAS_SIZE,
                 bgcolor=BLACK, output_file=DEFAULT_OUTPUT_FILE):
        '''Creating a new canvas'''
        self.size = size
        self.width = size[0]
        self.height = size[1]
        self.bgcolor = bgcolor
        self.output_file = self._create_uniq_file_name(output_file)
        self.newest_output_file = self._create_file_name(output_file)
        self.output_thumbnail = self._create_file_name('out_thumbnail.png')
        self.image = Image.new('L', self.size, self.bgcolor)
        self.image_coords = []

    def _create_uniq_file_name(self, outfile):
        fname, ext = os.path.splitext(outfile)
        tstamp = str(time.time()).replace('.', '_')
        uniq_fname = '{}_{}{}'.format(fname, tstamp, ext)
        return os.path.join(OUTPUT_IMAGES, uniq_fname)

    def _create_file_name(self, outfile):
        fname, ext = os.path.splitext(outfile)
        uniq_fname = '{}{}'.format(fname, ext)
        return os.path.join(OUTPUT_STATIC, uniq_fname)
    def _image_gt_canvas_size(self, img):
        return img.size[0] > self.image.size[0] or \
               img.size[1] > self.image.size[1]

    def add_text(self, font):
        '''Adds text on a given image object'''
        draw = ImageDraw.Draw(self.image)
        pillow_font = ImageFont.truetype(font.ttf, font.size)

        # from https://stackoverflow.com/a/7698300
        # if only 1 image use the extra space for text
        single_image = len(self.image_coords) == 1
        text_width = CHARS_PER_LINE * 1.4 if single_image else CHARS_PER_LINE

        lines = textwrap.wrap(font.text, width=text_width)

        if font.offset:
            x_text, y_text = font.offset
        else:
            # if no offset given put text alongside first image
            left_image_px = min(img.left + img.size[0]
                                for img in self.image_coords)

            x_text = left_image_px + TEXT_PADDING_HOR

            # if <= 2 lines center them more vertically
            y_text = Y_TEXT_START * 2 if len(lines) < 3 else Y_TEXT_START

        for line in lines:
            _, height = pillow_font.getsize(line)
            draw.text((x_text, y_text), line, font.color, font=pillow_font)
            y_text += height
    def add_solid_background(self):
        ImageDraw.rectangle(DEFAULT_CANVAS_SIZE, fill=BLACK, outline=None, width=None)
    def add_background(self, image, resize=False):
        img = Image.open(image).convert('RGBA')

        overlay = Image.new('RGBA', img.size, WHITE_TRANSPARENT_OVERLAY)
        bg_img = Image.alpha_composite(img, overlay)

        if resize:
            bg_size = (self.width * RESIZE_PERCENTAGE, self.height)
            bg_img.thumbnail(bg_size, Image.ANTIALIAS)
            left = self.width - bg_img.size[0]
            self.image.paste(bg_img, (left, 0))
        else:
            self.image.paste(bg_img.resize(DEFAULT_CANVAS_SIZE,
                                           Image.ANTIALIAS), (0, 0))

    def add_park_rules(self):
        image = "32Eink_Rules.jpg"
        get_image(image)
        self.add_image(get_image(image), box=rules)
    def add_welcome(self):
        image = "32Eink_WM_title.jpg"
        self.add_image(get_image(image), box=welcome)
    def add_callout(self):
        image = "32Eink_lightfoot.jpg"
        self.add_image(get_image(image), box=facts)
    def add_water_data(self):
        image = "32Eink_water_data.jpg"
        self.add_image(get_image(image), box=data_box)

    def add_get_involved(self):
        image = "32Eink_get_involved_logo.jpg"
        self.add_image(get_image(image), box=get_involved)
    def add_image(self, image, location=None,box=None, resize=False, scale=True, invert=False,
                  offset=None, left=0, right=False):
        '''
            resize=False or resize %, or (x,y) tupple.
                if scale is true, image resized to largest area inside box w/o distortion
                if scale == False, image fits box
            Adds (pastes) image on canvas
           If right is given calculate left, else take left
           Returns added img size'''
        img = Image.open(image)
        img.convert(mode="L")
        #todo implement ANTIALIAS
        if resize:
            size = img.size
            if type(resize) == float:
                (width, height) = (img.width * resize, img.height * resize)
                img = img.resize((width,height))
            if type(resize) == tuple:
                if scale is True:
                    resize_scale = min(resize[0]/img.width, resize[1]/img.height)
                    (width, height) = (img.width * resize_scale, img.height * resize_scale)
                    img = img.resize((width, height))
                if scale is False:
                    img = img.resize(resize)
            if resize is True:
                if scale is True:
                    resize_scale = min(box['size'][0]/img.width, box['size'][1]/img.height)
                    (width, height) = (img.width * resize_scale, img.height * resize_scale)
                    img = img.resize((width,height))
                if scale is False:
                    img.resize(box['size'])
            # img.thumbnail((size, size), Image.ANTIALIAS)
        if location:
            image_location = location
        if box:
            image_location = box['loc']
        if offset:
            image_location = (image_location[0] + offset[0], image_location[1] + offset[1])
        print(image_location, img.width)
        self.image.paste(img, image_location)

    def box_position(self, x_y, box=None):
        """Takes location from % location in box if less than 1,
        if greater than 1 takes as an apsolute value"""
        if x_y[0] <= 1:
            rel_x = int((box['size'][0] * x_y[0]) + box['loc'][0])
        if x_y[0] > 1:
            rel_x = int(x_y[0] + box['loc'][0])
        if x_y[1] <= 1:
            rel_y = int((box['size'][1] * x_y[1]) + box['loc'][1])
        if x_y[1] > 1:
            rel_y = int(x_y[1] + box['loc'][1])
        return (rel_x, rel_y)
    def draw_text_at_location(self, font, box, relitive_location, margin=0, return_box = False):
        #todo: implement return box to get coordinates of text and determine how to do the relitve location
        """
        font is datatype font
        box is defined at top
        relitive location is defined as rendered
        if margin is int: Render as right margin
        if margin is tuple: take as left/right (left,right)
        if margin is list, render as list of tupples to avoid [(existing box)]
        """
        print(box['size'][0]- margin)
        if type(margin) is int:
            computed_margin = box['size'][0] - margin
        print(f'draw_text_at_location: {box}, {font}, {relitive_location}')
        if font.text is None:
            print(f'Error, no text for:  {font, box, relitive_location}')
            return
        draw = ImageDraw.Draw(self.image)
        pillow_font = ImageFont.truetype(font.ttf, font.size)
        text_location = (int(box['loc'][0] + relitive_location[0]), int(box['loc'][1] + relitive_location[1]))
        print(text_location)
        position = self.box_position(relitive_location,box)
        wrapped_text, use_wrapped = text_wrap(font.text,pillow_font,computed_margin)
        print(font)
        if use_wrapped:
            if return_box:
                return pillow_font.getbbox(wrapped_text)
            draw.text(position, wrapped_text, font=pillow_font, fill=font.color,  align=font.align)
        else:
            if return_box:
                return pillow_font.getbbox(wrapped_text)
            draw.text(position, wrapped_text, font=pillow_font, fill=font.color, anchor=font.anchor)
        # draw.text(position, wrapped_text, font=pillow_font,  fill=font.color,anchor=font.anchor)
    def add_text_date(self,date,box,start_time=None, end_time=None):
        draw = ImageDraw.Draw(self.image)
        # box['loc'] = self.scale(box['loc'])
        # box['size'] = self.scale(box['size'])

        # day_of_month_font = Font(ttf=bold_font,text=None,color=WHITE, size=date_size,offset=None,anchor='mm')
        def center_text(msg,font):
            w, h =draw.textsize(msg,font)
            return w, h

        def strip_0(hour):
            if hour[0] == '0':
                return hour[1]
        # font = Font(ttf=TEXT_FONT_TYPE,
        #             text=None,
        #             color=WHITE,
        #             size=TEXT_SIZE,
        #             anchor=None,
        #             offset=None)

        text_box = (box['loc'][0]+60, box['loc'][1]+60)
        print(text_box)

        if type(date) == str:
            datetime.strptime(date)
        # %a abbreviated day, %d is 01
        day = Font(ttf=demiBold_font,text=date.strftime("%A"),color=WHITE, size=font_size(3), offset=None,anchor='mb')
        day_of_month = Font(ttf=medium_font,text=date.strftime("%-d"),color=WHITE, size=font_size(8), offset=boarder_l,anchor='mb')
        print(f'\n\n{day_of_month}\n')
        month = Font(ttf=medium_font,text=date.strftime("%B"),color=WHITE, size=font_size(1), offset=None,anchor='mt')
        self.draw_text_at_location(day_of_month,box,day_of_month_center)
        self.draw_text_at_location(day,box,day_center)
        self.draw_text_at_location(month,box,month_center)
        pillow_font = ImageFont.truetype(TEXT_FONT_TYPE, H1['size'])
        # draw.text(text_box,day,font=pillow_font, color=WHITE,anchor='mt',align='center')
        print(f'start_time / end_time: {start_time}, {end_time}')
        if end_time is not None:
            hour_start = strip_0(start_time.strftime("%I"))
            minute_start = start_time.strftime("%M")
            am_pm_start = start_time.strftime("%p")
            event_start_time = Font(ttf=demiBold_font,text=f"{hour_start}:{minute_start}{am_pm_start}",color=WHITE, size=font_size(3), offset=None,anchor='lb')
            hour_end = strip_0(end_time.strftime("%I"))
            minute_end = end_time.strftime("%M")
            am_pm_end = end_time.strftime("%p")
            event_end_time = Font(ttf=medium_font,text=f"to {hour_end}:{minute_end}{am_pm_end}",color=WHITE, size=font_size(1), offset=None,anchor='lt')
            self.draw_text_at_location(event_start_time,box,time_start_center)
            self.draw_text_at_location(event_end_time, box, time_end_center)
        print('fin')
    def qr_create(self,url,box):
        qr = qrcode.QRCode(version=1, box_size=2, border=0,error_correction=qrcode.constants.ERROR_CORRECT_L )
        qr.add_data(url)
        qr.make()
        img_qr = qr.make_image(fill_color="black", back_color="white")
        print(img_qr.size)
        center_margin = (box['size'][1] - img_qr.size[1])/2
        qr_location = (int(box['loc'][0]+box['size'][0] - box['size'][1]+center_margin),int(box['loc'][1]+center_margin))
        print(qr_location)
        self.image.paste(img_qr,qr_location)
    def input_event(self, event,box):
        # todo input dates
        print(f'Input event: {event}')
        self.add_text_date(event['date'], box, start_time=event['start_time'], end_time=event['end_time'])
        header = Font(text=event['header'], **header_font)
        title = Font(text=event['title'], **event_title_font)
        sub_text = Font(text=event['sub_text'], **sub_text_font)
        self.draw_text_at_location(header, box, (0.5, 0.25))
        self.draw_text_at_location(title, box, (0.5, 0.33))
        self.draw_text_at_location(sub_text, box, (0.5, 0.80))
        print(box)
        self.qr_create(event['url'], box)
    # def calculate_box_locations(self,virtical_margins = None,horizontal_margin = None, ):

    def input_action(self, event,box):
        # todo input dates
        print(f'Input action: {event}')
        # category = Font(text=event['header'], **header_font)
        title = Font(text=event['title'], **action_title_font)
        sub_text = Font(text=event['sub_text'], **action_text_font)
        if event['date']:
            if event['start_time']:
                if event['end_time']:
                    self.add_text_date(event['date'], box, start_time=event['start_time'], end_time=event['end_time'])
                else:
                    self.add_text_date(event['date'], box, start_time=event['start_time'])
            self.add_text_date(event['date'], box)
            title_text = self.draw_text_at_location(title, box, (time_left_margin, 10),return_box=True)
            self.draw_text_at_location(title, box, (time_left_margin, 10))
            title_text_bottom = title_text[3] + boarder_l
            self.draw_text_at_location(sub_text, box, (time_left_margin, title_text_bottom), margin=time_left_margin)
        else:
            self.draw_text_at_location(title, box, (title_text_left))
            # title_text = self.draw_text_at_location(title, box, (title_text_left),return_box=True)
            title_box_boundries = self.draw_text_at_location(title, box, (title_text_left), return_box=True)
            sub_offset_margin = title_box_boundries[3] + boarder_s
            sub_offset = offset_position(sub_text_left,(0,sub_offset_margin))
            self.draw_text_at_location(sub_text, box, (sub_offset))
        # self.draw_text_at_location(category, box, (0.5, 0.25))
        if event['url']:
            self.qr_create(event['url'], box)
        # self.draw_text_at_location(title, box, (0.5, 0.33))
        # self.draw_text_at_location(sub_text, box, (0.5, 0.80))
        # print(box)
    def input_callout(self, event,box):
        # todo input dates
        print(f'Input callout: {event}')
        # category = Font(text=event['header'], **header_font)
        header = Font(text=event['header'], **callout_header_font)
        title = Font(text=event['title'], **callout_title_font)
        body = Font(text=event['body'], **callout_body_font)
        self.draw_text_at_location(title, box, (callout_title))
        header_box_boundries = self.draw_text_at_location(title, box, (callout_header), return_box=True)
        sub_offset = offset_position(sub_text_left,(0,header_box_boundries[3]))
        self.draw_text_at_location(body, box, (sub_offset))
        # if event['url']:
        #     self.qr_create(event['url'], box)
        # self.draw_text_at_location(title, box, (0.5, 0.33))
        # self.draw_text_at_location(sub_text, box, (0.5, 0.80))
        # print(box)
    def generate_boarder(self, boxes,direction,width):
        """
        list of boxes,
        direction: 0=below/horizontal 1=right/virtical
        width of line
        """

        draw = ImageDraw.Draw(self.image)
        for box in boxes:
            line_cord = []
            if direction == 0:
                line_cord.append((box['loc'][0],box['loc'][1]))
                line_cord.append((box['loc'][0] + box['size'][0],box['loc'][1]))
            if direction == 1:
                line_cord.append((box['loc'][0] + box['size'][0],box['loc'][1]))
                line_cord.append((box['loc'][0] + box['size'][0], box['size'][1] + box['loc'][1]))
            draw.line(line_cord,fill=WHITE,width=width)

    def save_image(self):
        test = self.image.convert('L', dither=Image.NONE)
        
        self.image.save(self.output_file)
        self.image.save(self.newest_output_file, format='JPEG', **jpeg_params)
        self.image.thumbnail((427,240))
        self.image.save(self.output_thumbnail)


def _download_image(from_url, to_file, chunk_size=2000):
    r = requests.get(from_url, stream=True)

    with open(to_file, 'wb') as fd:
        for chunk in r.iter_content(chunk_size):
            fd.write(chunk)


def get_image(image_url):
    basename = os.path.basename(image_url)
    local_image = os.path.join(IMAGES, basename)

    if not os.path.isfile(local_image):
        _download_image(image_url, local_image)

    return local_image


def text_wrap(text, font, max_width):
    """Wrap text base on specified width.
    This is to enable text of width more than the image width to be display
    nicely.
    @params:
        text: str
            text to wrap
        font: obj
            font of the text
        max_width: int
            width to split the text with
    @return
        lines: list[str]
            list of sub-strings
    """
    lines = []
    use_wrapped = False
    # If the text width is smaller than the image width, then no need to split
    # just add it to the line list and return
    if font.getsize(text)[0] <= max_width:
        lines.append(text)
    else:
        # split the line by spaces to get words
        words = text.split(' ')
        i = 0
        use_wrapped = True
        # append every word to a line while its width is shorter than the image width
        while i < len(words):
            line = ''
            while i < len(words) and font.getsize(line + words[i])[0] <= max_width:
                line = line + words[i] + " "
                i += 1
            if not line:
                line = words[i]
                i += 1
            lines.append(line)
    split_lines = '\n'.join(lines)
    return split_lines, use_wrapped
#

def filter_inputs(inputs,banner):
    all_events = []
    all_activities = []
    callout = ''
    for input in inputs:
        if input['date']:
            input['date'] = parser.parse(input['date'])
            if input['start_time']:
                input['start_time'] = parser.parse(input['start_time'])
            if input['end_time']:
                input['end_time'] = parser.parse(input['end_time'])
            # all_events.append(input)
        if input['category'] == 'event':
            all_events.append(input)
        if input['category'] == 'activity':
            all_activities.append(input)
        if input['category'] == 'callout':
            callout = input
            banner.input_callout(callout, banner)
    input_events(all_events,banner)
    input_activities(all_activities, banner)

def input_events(all_events,banner):
    print(f'all_events: {all_events}')
    all_events = sorted(all_events, key=lambda d: d['date'])
    event_item_length = len(events_items)
    for num in range(len(all_events)):
        print(num)
        if event_item_length > num:
            print(all_events)
            banner.input_event(all_events[num], events_items[num])
def input_activities(all_activities, banner):
    # all_events = sorted(all_events, key=lambda d: d['date'])
    activity_item_length = len(activity_items)
    for num in range(len(all_activities)):
        print(num)
        if activity_item_length > num:
            print(f'all_events: {all_activities}')
            banner.input_action(all_activities[num], activity_items[num])


def generate_banner(img_banner):
    # image1 = img_banner.image1
    # image2 = get_image(img_banner.image2)
    # text = img_banner.text

    banner = Banner()
    filter_inputs(img_banner, banner)
    # banner.add_solid_background()
    # if img_banner.background:
    #     banner.add_background(image2)
    # else:
    #     banner.add_image(image2, resize=True, right=True)


    # banner.add_image(image1)

    # font = Font(ttf=TEXT_FONT_TYPE,
    #             text=text,
    #             color=WHITE,
    #             size=TEXT_SIZE,
    #             offset=None)
    # banner.add_text_date(datetime.now(),event_1,datetime.now())
    # banner.add_text_date(datetime.now(),event_2,datetime.now())
    # banner.add_text_date(datetime.now(),event_3,datetime.now())
    # banner.add_text(font)
    title_1 = Font(text='Upcoming Events', **title_font )
    to_do_title = Font(text='Things to do', **title_font)
    # event_example = {'header': 'Wild Mile Workshop', 'title':'Building for Birds Night', 'sub_text':'With Chicago Women in Trades', 'date': datetime.now(), 'end_date': datetime.now(),'url':'https://www.eventbrite.com/e/haunted-hotel-halloween-ball-2022-at-congress-plaza-hotel-tickets-204916529857?aff=ebdssbcitybrowse'}
    # banner.input_event(event_example,event_1)
    banner.draw_text_at_location(title_1,event_title,(0.5,0.5))
    banner.draw_text_at_location(to_do_title,action_title,(0.5,0.5))

    banner.add_park_rules()
    banner.add_welcome()
    banner.add_callout()
    banner.add_get_involved()
    banner.add_water_data()

    banner.generate_boarder(top_boxes,1,16)
    banner.generate_boarder(mid_line,0,10)
    banner.generate_boarder(events,1,16)
    banner.generate_boarder(events,0,10)
    banner.generate_boarder(action,1,16)
    banner.generate_boarder(action,0,10)
    banner.save_image()

    return banner.output_file
