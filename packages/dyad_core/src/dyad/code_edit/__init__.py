from dyad.apply_code import register_code_edit_handler
from dyad.code_edit.simple_handler import simple_apply_code_handler

register_code_edit_handler("whole-file", simple_apply_code_handler)
