# frozen_string_literal: true
#
# CC BY-NC-SA 4.0 (Attribution-NonCommercial-ShareAlike)
# https://creativecommons.org/licenses/by-nc-sa/4.0/
#
# Cloudflare Pages sometimes runs Jekyll under a US-ASCII locale, which makes
# Ruby Sass (used by `jekyll-sass-converter` v1) crash when compiling theme SCSS
# containing Unicode characters. Force UTF-8 defaults early so the SCSS pipeline
# can read UTF-8 sources reliably.

Encoding.default_external = Encoding::UTF_8
Encoding.default_internal = Encoding::UTF_8

