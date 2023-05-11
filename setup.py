from setuptools import setup

setup(
    name='eink_gen',
    packages=['eink_gen'],
    include_package_data=True,
    debug=True,
    install_requires=[
        'flask',
        'flask_wtf',
        'wtforms',
        'PIL',
        'qrcode'
    ],
)