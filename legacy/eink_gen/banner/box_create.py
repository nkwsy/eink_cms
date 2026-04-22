
class CreateBox:
    def __init__(self, box, banner):
        self.width = box['size'][0]
        self.height = box['size'][1]
        self.draw = banner.image

    def draw_text_at_location(self, font, box, relitive_location, return_box=False):
        # todo: implement return box to get coordinates of text and determine how to do the relitve location
        print(f'draw_text_at_location: {box}, {font}, {relitive_location}')
        if font.text is None:
            print(f'Error, no text for:  {font, box, relitive_location}')
            return
        draw = ImageDraw.Draw(self.image)
        pillow_font = ImageFont.truetype(font.ttf, font.size)
        text_location = (int(box['loc'][0] + relitive_location[0]), int(box['loc'][1] + relitive_location[1]))
        print(text_location)
        position = self.box_position(relitive_location, box)
        wrapped_text, use_wrapped = text_wrap(font.text, pillow_font, box['size'][0])
        print(font)
        if use_wrapped:
            if return_box:
                return draw.multiline_textbbox(position, wrapped_text, font=pillow_font, align=font.align)
            draw.text(position, wrapped_text, font=pillow_font, fill=font.color, align=font.align)
        else:
            if return_box:
                return draw.multiline_textbbox(position, wrapped_text, font=pillow_font, align=font.align)
            draw.text(position, wrapped_text, font=pillow_font, fill=font.color, anchor=font.anchor)
        # draw.text(position, wrapped_text, font=pillow_font,  fill=font.color,anchor=font.anchor)


    def add_text_date(self, date, box, start_time=None, end_time=None):
        draw = ImageDraw.Draw(self.image)

        # box['loc'] = self.scale(box['loc'])
        # box['size'] = self.scale(box['size'])

        # day_of_month_font = Font(ttf=bold_font,text=None,color=WHITE, size=date_size,offset=None,anchor='mm')
        def center_text(msg, font):
            w, h = draw.textsize(msg, font)
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

        text_box = (box['loc'][0] + 60, box['loc'][1] + 60)
        print(text_box)

        if type(date) == str:
            datetime.strptime(date)
        # %a abbreviated day, %d is 01
        day = Font(ttf=demiBold_font, text=date.strftime("%A"), color=WHITE, size=font_size(3), offset=None, anchor='mb')
        day_of_month = Font(ttf=medium_font, text=date.strftime("%u"), color=WHITE, size=font_size(8), offset=boarder_l,
                            anchor='mb')
        month = Font(ttf=medium_font, text=date.strftime("%B"), color=WHITE, size=font_size(1), offset=None, anchor='mt')
        self.draw_text_at_location(day_of_month, box, day_of_month_center)
        self.draw_text_at_location(day, box, day_center)
        self.draw_text_at_location(month, box, month_center)
        pillow_font = ImageFont.truetype(TEXT_FONT_TYPE, H1['size'])
        # draw.text(text_box,day,font=pillow_font, color=WHITE,anchor='mt',align='center')
        print(f'start_time / end_time: {start_time}, {end_time}')
        if end_time is not None:
            hour_start = strip_0(start_time.strftime("%I"))
            minute_start = start_time.strftime("%M")
            am_pm_start = start_time.strftime("%p")
            event_start_time = Font(ttf=demiBold_font, text=f"{hour_start}:{minute_start}{am_pm_start}", color=WHITE,
                                    size=font_size(3), offset=None, anchor='lb')
            hour_end = strip_0(end_time.strftime("%I"))
            minute_end = end_time.strftime("%M")
            am_pm_end = end_time.strftime("%p")
            event_end_time = Font(ttf=medium_font, text=f"to {hour_end}:{minute_end}{am_pm_end}", color=WHITE,
                                  size=font_size(1), offset=None, anchor='lt')
            self.draw_text_at_location(event_start_time, box, time_start_center)
            self.draw_text_at_location(event_end_time, box, time_end_center)
        print('fin')


    def qr_create(self, url, box):
        qr = qrcode.QRCode(version=1, box_size=2, border=0, error_correction=qrcode.constants.ERROR_CORRECT_L)
        qr.add_data(url)
        qr.make()
        img_qr = qr.make_image(fill_color="black", back_color="white")
        print(img_qr.size)
        center_margin = (box['size'][1] - img_qr.size[1]) / 2
        qr_location = (
            int(box['loc'][0] + box['size'][0] - box['size'][1] + center_margin), int(box['loc'][1] + center_margin))
        print(qr_location)
        self.image.paste(img_qr, qr_location)


    def input_event(self, event, box):
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


    def input_action(self, event, box):
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
            self.draw_text_at_location(title, box, (0.5, 0.33))
            self.draw_text_at_location(sub_text, box, (0.5, 0.80))
        else:
            self.draw_text_at_location(title, box, (title_text_left))
            self.draw_text_at_location(sub_text, box, (sub_text_left))
        # self.draw_text_at_location(category, box, (0.5, 0.25))
        if event['url']:
            self.qr_create(event['url'], box)
        # self.draw_text_at_location(title, box, (0.5, 0.33))
        # self.draw_text_at_location(sub_text, box, (0.5, 0.80))
        # print(box)
