/*
 * Unicode Character Finder
 * Copyright (c) 2010-2015 Grant McLean <grant@mclean.net.nz>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

(function($) {

    "use strict";

    var block_mask = 0xFFFF80
    var preview_reset_list = 'unassigned noncharacter surrogate pua';


    /* Utility Functions
     * ================= */

    function dec2hex(dec, len) {
        var hex = dec.toString(16).toUpperCase();
        while (hex.length < len) { hex = "0" + hex; }
        return hex;
    }

    function hex2dec(hex) {
        return parseInt(hex, 16);
    }

    function codepoint_to_string(cp) {
        if(cp < 65536) {
            return String.fromCharCode(cp);
        }
        var hi = Math.floor((cp - 0x10000) / 0x400) + 0xD800;
        var lo = ((cp - 0x10000) % 0x400) + 0xDC00;
        return String.fromCharCode(hi) + String.fromCharCode(lo);
    }

    function string_to_codepoint(str) {
        if(str === '') {
            return null;
        }
        var hi = str.charCodeAt(0);
        if((hi & 0xF800) != 0xD800) {
            return hi;
        }
        var lo = str.charCodeAt(1);
        return ((hi - 0xD800) * 0x400) + (lo - 0xDC00) + 0x10000;
    }

    function dec2utf8(dec) {
        if(dec < 0x80) {
            return dec2hex(dec,2);
        }
        if(dec < 0x800) {
            return dec2hex(0xC0 | (dec >> 6), 2) + " "
                + dec2hex(0x80 | (dec & 0x3F), 2);
        }
        if(dec < 0x10000) {
            return dec2hex(0xE0 | (dec >> 12), 2) + " "
                + dec2hex(0x80 | ((dec >> 6)) & 0x3F, 2) + " "
                + dec2hex(0x80 | (dec & 0x3F), 2);
        }
        if(dec < 0x110000) {
            return dec2hex(0xF0 | (dec >> 18), 2) + " "
                + dec2hex(0x80 | ((dec >> 12) & 0x3F), 2) + " "
                + dec2hex(0x80 | ((dec >> 6) & 0x3F), 2) + " "
                + dec2hex(0x80 | (dec & 0x3F), 2);
        }
        return "unknown";
    }

    function dec2utf16(dec) {
        if(dec < 0x10000) {
            return dec2hex(dec, 4);
        }
        if (dec < 0x110000) {
            dec = dec - 0x10000;
            return dec2hex(0xD800 | (dec >> 10), 4) + " "
                + dec2hex(0xDC00 | (dec & 0x3FF), 4);
        }
        return "unknown";
    }


    /* UnicodeCharacterFinder Class Definition
     * ======================================= */

    var UnicodeCharacterFinder = function (el, options) {
        this.$el = $(el);
        this.opt = options;
        this.build_ui();
    }

    UnicodeCharacterFinder.prototype = {
        code_chart:       { },
        code_list:        [ ],
        reserved_ranges:  [ ],
        code_blocks:      [ ],
        html_ent:         { },
        html_name:        { },
        unique_ids:       [ ],
        max_codepoint:    0,

        build_ui: function () {
            this.$el.hide();
            this.start_loading_splash();

            this.load_unicode_data( this.enable_ui ); // callback when done

            this.add_font_dialog();
            this.add_help_dialog();
            this.add_code_chart_dialog();
            this.add_form_elements();
            this.add_sample_chars();
            this.$el.append(this.$form);
        },

        start_loading_splash: function () {
            var $div = $('<div class="ucf-splash-dlg"/>');
            this.$splash_dialog = $div;
            $div.append('<p class="ucf-loading">Please wait &#8230; </p>');
            $div.dialog({
                autoOpen:      true,
                title:         "Loading",
                resizable:     false,
                closeOnEscape: false,
                modal:         true,
                width:         350,
                height:        150
            });
            $div.ajaxError(function(event, req, settings, error) {
                $div.html(
                    '<p class="error">'
                    + '<span class="ui-icon ui-icon-alert"></span>'
                    + 'Failed to load Unicode character data.</p>'
                    + '<p>Have you run <code>make-data-file</code>?</p>'
                );
            });
        },

        enable_ui: function () {
            var app = this;
            this.populate_code_blocks_menu();
            this.$splash_dialog.dialog('close');
            this.$el.slideDown(600, function() {
                app.$search_input.focus();
            });
            this.select_codepoint(null);
            this.process_querystring();
        },

        process_querystring: function () {
            var args = jQuery.deparam(jQuery.param.querystring());
            // c=U+XXXX
            if(args.c && args.c.match(/^U[ +]([0-9A-Fa-f]{4,7})$/)) {
                this.select_codepoint(hex2dec(RegExp.$1));
            }
            // c=999
            else if(args.c && args.c.match(/^(\d+){1,9}$/)) {
                this.select_codepoint(parseInt(RegExp.$1, 10));
            }
            // c=uXXXXuXXXX
            else if(args.c && args.c.match(/^u([0-9A-Fa-f]{4})u([0-9A-Fa-f]{4})$/)) {
                var str = String.fromCharCode( hex2dec(RegExp.$1) )
                        + String.fromCharCode( hex2dec(RegExp.$2) );
                this.select_codepoint(string_to_codepoint(str));
            }
            // q=????
            else if(args.q) {
                this.$search_input.val(args.q).autocomplete('search');
            }
        },

        select_codepoint: function (cp) {
            if(this.curr_cp === cp) {
                return;
            }
            this.curr_cp = cp;
            this.curr_ch = this.lookup_char(cp);
            this.set_character_preview();
            this.show_character_detail();
            this.highlight_code_chart_char();
            this.select_block_name(this.curr_cp);
        },

        set_character_preview: function () {
            var cp = this.curr_cp;
            var ch = this.curr_ch;
            this.$form.removeClass('empty');
            this.$preview_input.removeClass(preview_reset_list);
            if(cp === null) {
                this.$preview_input.val('');
                this.$form.addClass('empty');
                this.$prev_char_btn.button('disable');
                this.$next_char_btn.button('disable');
            }
            else if(ch.reserved) {
                var str = ch.show ? codepoint_to_string(cp) : '';
                this.$preview_input.val(str);
                this.$preview_input.addClass(ch.reserved);
            }
            else {
                this.$preview_input.val(codepoint_to_string(cp));
                this.$prev_char_btn.button('enable');
                this.$next_char_btn.button('enable');
            }
        },

        lookup_char: function (cp) {
            if(cp === null) {
                return { };
            }
            var hex = dec2hex(cp, 4);
            if(this.code_chart[hex]) {
                return this.code_chart[hex];
            }
            return this.lookup_reserved_char(cp);
        },

        lookup_reserved_char: function (cp) {
            var range = this.lookup_reserved_range(cp);
            if(!range) {
                return null;
            }
            if(range.type === 'templated') {
                var desc = range.template.replace(/#/, hex2dec(cp, 4));
                return {
                    description: desc
                };
            }
            var ch = { reserved: range.type };
            switch(range.type) {
                case 'unassigned':
                    ch.description = "This codepoint is reserved as 'unassigned'";
                    ch.show = true;
                    ch.unassigned = true;
                    break;
                case 'noncharacter':
                    ch.description = "This codepoint is defined as a <noncharacter>";
                    ch.show = false;
                    ch.noncharacter = true;
                    break;
                case 'surrogate':
                    ch.description = "This codepoint is defined as a 'surrogate', it has no meaning unless combined with another codepoint";
                    ch.surrogate = true;
                    ch.show = false;
                    break;
                case 'pua':
                    ch.description = "This codepoint is in a Private Use Area (PUA)";
                    ch.show = true;
                    ch.pua = true;
                    break;
            }
            return ch;
        },

        lookup_reserved_range: function (cp) {
            for(var i = 0; i < this.reserved_ranges.length; i++) {
                if(cp > this.reserved_ranges[i].last_cp){
                    continue;
                }
                if(cp < this.reserved_ranges[i].first_cp){
                    return null;
                }
                return this.reserved_ranges[i];
            }
            return null;
        },

        show_character_detail: function () {
            var cp = this.curr_cp;
            if(cp === null) {
                return;
            }
            var hex   = dec2hex(cp, 4);
            var block = this.block_from_codepoint(cp);
            var ch    = this.curr_ch;
            this.$char_link.attr('href', '?c=U+' + hex);

            var $table = $('<table />').append(
                $('<tr />').append(
                    $('<th />').text('Code point'),
                    $('<td />').text('U+' + hex)
                )
            );
            if(ch && ch.description.length > 0) {
                var $td = $('<td />').text(ch.description);
                if(ch.alias) {
                    $td.append(
                        $('<br />'),
                        $('<span class="alias"/>').text(ch.alias)
                    );
                }
                $table.append(
                    $('<tr />').append( $('<th />').text('Description'), $td )
                );
            }
            if(!ch.reserved || ch.pua) {
                var entity = '&#' + cp + ';';
                if(this.html_name[hex]) {
                    entity = entity + ' or &' + this.html_name[hex] + ';';
                }
                $table.append(
                    $('<tr />').append(
                        $('<th />').text('HTML entity'),
                        $('<td />').text(entity)
                    )
                );
            }
            $table.append(
                $('<tr />').append(
                    $('<th />').text('UTF-8'),
                    $('<td />').text(dec2utf8(cp))
                ),
                $('<tr />').append(
                    $('<th />').text('UTF-16'),
                    $('<td />').text(dec2utf16(cp))
                )
            );
            if(block) {
                var $pdf_link = $('<a />')
                    .text(block.title)
                    .attr('href', block.pdf_url)
                    .attr('title', block.filename + ' at Unicode.org');
                $table.append(
                    $('<tr />').append(
                        $('<th />').text('Character block'),
                        $('<td />').append($pdf_link)
                    )
                );
            }
            this.$char_info.empty().append($table);
        },

        check_preview_input: function (click_only) {
            var str = this.$preview_input.val();
            var len = str.length;
            if(len === 0) {
                if(click_only) {
                    return;
                }
                this.select_codepoint(null);
            }
            if(len > 1) {
                if((str.charCodeAt(len - 2) & 0xF800) === 0xD800) {
                    str = str.substr(len - 2, 2);
                }
                else {
                    str = str.substr(len - 1, 1);
                }
                this.$preview_input.val(str);
            }
            this.select_codepoint(string_to_codepoint(str));
        },

        add_font_dialog: function () {
            var app = this;
            var $font_tab = $('<div class="ucf-tab-font" />');
            this.$el.append($font_tab);

            var $div = $('<div class="ucf-font-menu" />');
            this.$font_dialog = $div;
            $div.attr('id', this.$el.data('font_dlg_id'));
            var $inp = $('<input type="text" class="ucf-font" />')
                .css({'width': '180px'});;
            $div.append(
                $('<p>Font name</p>'),
                $inp
            );

            $div.dialog({
                autoOpen:      false,
                title:         "Font Selection",
                resizable:     false,
                closeOnEscape: true,
                width:         220,
                height:        160,
                buttons:       {
                    "Save":  function() {
                        app.save_font($inp.val());
                        $div.dialog("close");
                    },
                    "Cancel": function() { $(this).dialog("close"); }
                }
            });

            $font_tab.click(function() { $div.dialog('open'); });
        },

        add_help_dialog: function () {
            var sel = this.opt.help_selector;
            if(sel) {
                var $div = $(sel);
                if($div.length > 0) {
                    var $help_tab = $('<div class="ucf-tab-help" />');
                    $div.dialog({
                        autoOpen:      false,
                        title:         "Using the Unicode Character Finder",
                        resizable:     true,
                        closeOnEscape: true,
                        modal:         true,
                        width:         600,
                        height:        400,
                        buttons:       {
                            "Close": function() { $(this).dialog("close"); }
                        }
                    });
                    $help_tab.click(function() { $div.dialog('open'); });
                    this.$el.append($help_tab);
                }
            }
        },

        char_search_field: function () {
            this.$search_wrapper = $('<div class="search-wrap empty" />')
                .append(
                    $('<label />').text('Search character descriptions:'),
                    this.build_search_link(),
                    this.build_search_input()
                );
            this.init_search_input();
            return this.$search_wrapper;
        },

        build_search_link: function () {
            var app = this;
            return this.$search_link =
                $('<a class="search-link" title="Link to this search" />')
                    .html('&#167;')
                    .keyup(function() { app.set_search_link(); })
                    .blur( function() { app.set_search_link(); });
        },

        build_search_input: function () {
            return this.$search_input = $('<input type="text" class="search" />')
        },

        init_search_input: function () {
            var app = this;
            this.$search_input.autocomplete({
                delay: 900,
                minLength: 1,
                source: function(request, response) {
                    var target = request.term;
                    app.set_search_link();
                    if(target != '') {
                        var search_method = 'execute_search';
                        if(target.charAt(0) === '/') {
                            if(target.length < 3 || target.charAt(target.length - 1) != '/') {
                                return;
                            }
                            target = target.substr(1, target.length - 2);
                            search_method = 'execute_regex_search';
                        }
                        app.$search_input.addClass('busy');
                        setTimeout(function() {
                            app[search_method](target, response);
                        }, 2 );
                    }
                },
                open: function(e, ui) {
                    app.$search_input.removeClass('busy');
                },
                focus: function(e, ui) {
                    return false;
                },
                select: function(e, ui) {
                    app.select_codepoint(ui.item.cp);
                    window.scrollTo(0,0);
                    return false;
                }
            });
        },

        set_search_link: function () {
            var str = this.$search_input.val();
            if(str.length === 0) {
                this.$search_wrapper.addClass('empty');
            }
            else {
                this.$search_wrapper.removeClass('empty');
                var link = jQuery.param.querystring('?', { q: str });
                this.$search_link.attr('href', link);
            }
        },

        add_form_elements: function () {
            this.$form = $('<form class="ucf-app empty" />').append(
                this.char_info_pane(),
                this.char_search_field()
            ).submit(function(event) {
                event.preventDefault();
            });
        },

        char_info_pane: function () {
            return $('<div class="char-wrap"></div>').append(
                this.build_char_preview_pane(),
                this.build_char_details_pane()
            );
        },

        build_char_preview_pane: function () {
            return $('<div class="char-preview"></div>').append(
                $('<div class="char-preview-label">Character<br />Preview</div>'),
                this.build_preview_input(),
                this.build_char_buttons()
            );
        },

        build_preview_input: function () {
            var app = this;
            var cb1 = function() { app.check_preview_input(); };
            var cb2 = function() { app.check_preview_input(true); };
            return this.$preview_input =
                $('<input type="text" class="char needs-font" title="Type or paste a character" />')
                .change( cb1 )
                .keypress(function() { setTimeout(cb1, 50); })
                .mouseup(function() { setTimeout(cb2, 50); })
                .mousewheel(function(event, delta) {
                    app.scroll_char(event, delta);
                    event.preventDefault();
                });
        },

        build_char_buttons: function () {
            var app = this;
            this.$prev_char_btn =
                $('<button class="char-prev" title="Previous character" />')
                    .text('Prev')
                    .button({ icons: { primary: 'ui-icon-circle-triangle-w' } })
                    .click(function() { app.increment_code_point(-1); });
            this.$char_menu_btn =
                $('<button class="char-menu" title="Show code chart" />')
                    .text('Chart')
                    .button({ icons: { primary: 'ui-icon-circle-triangle-s' } })
                    .click(function() { app.display_chart_dialog(); });
            this.$next_char_btn =
                $('<button class="char-next" title="Next character" />')
                    .text('Next')
                    .button({ icons: { primary: 'ui-icon-circle-triangle-e' } })
                    .click(function() { app.increment_code_point(1); });
            this.$char_link =
                $('<a class="char-link" title="Link to this character" />')
                    .html('&#167;');
            return $('<span class="char-buttons" />').append(
                this.$prev_char_btn,
                this.$char_menu_btn,
                this.$next_char_btn,
                this.$char_link
            );
        },

        add_sample_chars: function () {
            if(this.opt.sample_chars) {
                this.$form.append( this.sample_char_links() );
            }
        },

        sample_char_links: function () {
            var app = this;
            var chars = this.opt.sample_chars;

            var $div = $(
                '<div class="sample-wrap" title="click character to select">'
                + 'Examples &#8230; </div>'
            );

            var $list = $('<ul></ul>');
            for(var i = 0; i < chars.length; i++) {
                $list.append(
                    $('<li></li>').text(codepoint_to_string(chars[i]))
                );
            }
            $div.append($list);

            $list.find('li').click(function () {
                app.select_codepoint(string_to_codepoint( $(this).text() ));
            });
            return $div;
        },

        add_code_chart_dialog: function () {
            var app = this;
            this.$chart_dialog = $('<div class="ucf-chart-dialog" />').append(
                this.build_code_chart_table(),
                this.build_code_chart_buttons()
            )
            .dialog({
                autoOpen:      false,
                title:         "Unicode Character Chart",
                resizable:     false,
                closeOnEscape: true,
                width:         555,
                height:        300
            });
        },

        build_code_chart_table: function () {
            var app = this;
            this.$code_chart_table = $('<table class="ucf-code-chart" />')
                .delegate('td', 'click', function() { app.code_chart_click(this); })
                .mousewheel(function(event, delta) {
                    app.increment_chart_page(-1 * delta)
                    event.preventDefault();
                });
            return $('<div class="ucf-chart-wrapper" />')
                .append(this.$code_chart_table);
        },

        build_code_chart_buttons: function () {
            var app = this;
            return $('<div class="ucf-chart-buttons" />').append(
                $('<button>').text('Close').button({
                    icons: { primary: 'ui-icon-circle-close' }
                }).click( function() {
                    app.$chart_dialog.dialog("close");
                }),
                $('<button>').text('Next').button({
                    icons: { primary: 'ui-icon-circle-triangle-e' }
                }).click( function() {
                    app.increment_chart_page(1);
                }),
                $('<button>').text('Prev').button({
                    icons: { primary: 'ui-icon-circle-triangle-w' }
                }).click( function() {
                    app.increment_chart_page(-1);
                }),
                this.build_blocks_menu()
            );
        },

        build_blocks_menu: function () {
            var app = this;
            return this.$blocks_menu = $('<select class="ucf-block-menu">')
                .change(function() {
                    var block = app.code_blocks[$(this).val()];
                    var code_base = block.start_dec & block_mask;
                    app.set_code_chart_page(code_base);
                });
        },

        build_char_details_pane: function () {
            this.$char_info = $('<div class="char-info"></div>');
            return $('<div class="char-props"></div>').append(
                $('<div class="char-props-label">Character<br />Properties</div>'),
                this.$char_info
            );
        },

        populate_code_blocks_menu: function () {
            for(var i = 0; i < this.code_blocks.length; i++) {
                this.$blocks_menu.append(
                    $('<option>').text(
                        this.code_blocks[i].start + ' ' + this.code_blocks[i].title
                    ).attr('value', i)
                );
            }
        },

        execute_search: function (target, response) {
            var result = [ ];
            var seen   = { };
            this.add_exact_matches(result, seen, target);
            target     = target.toUpperCase();
            var len    = this.code_list.length;
            var code, ch;
            for(var i = 0; i < len; i++) {
                if(result.length > 10) { break; };
                code = this.code_list[i];
                ch   = this.code_chart[code];
                if(
                    ch.description.indexOf(target) >= 0
                    || (ch.alias && ch.alias.indexOf(target) >= 0)
                ) {
                    this.add_result(result, seen, code, ch);
                }
            }
            if(result.length === 0) {
                this.$search_input.removeClass('busy');
            }
            response(result);
        },

        add_exact_matches: function (result, seen, target) {
            var dec, hex, ch;
            if(target.match(/^&#(\d+);?$/) || target.match(/^(\d+)$/)) {
                dec = parseInt(RegExp.$1, 10);
                hex = dec2hex(dec, 4);
                ch  = this.code_chart[hex];
                if(ch) {
                    this.add_result(result, seen, hex, ch, '[Decimal: ' + dec + ']');
                }
            }
            if(target.match(/^&#x([0-9a-f]+);?$/i) || target.match(/^(?:U[+])?([0-9a-f]+)$/i)) {
                dec = hex2dec(RegExp.$1);
                hex = dec2hex(dec, 4);
                ch  = this.code_chart[hex];
                if(ch) {
                    this.add_result(result, seen, hex, ch);
                }
            }
            if(target.match(/^(?:&#?)?(\w+);?$/)) {
                target = RegExp.$1;
            }
            if(this.html_ent[target]) {
                hex = this.html_ent[target];
                ch  = this.code_chart[hex];
                if(ch) {
                    this.add_result(result, seen, hex, ch, '[&' + target + ';]');
                }
            }
            else if(this.html_ent[target.toLowerCase()]) {
                hex = this.html_ent[target.toLowerCase()];
                ch  = this.code_chart[hex];
                if(ch) {
                    this.add_result(result, seen, hex, ch, '[&' + target.toLowerCase() + ';]');
                }
            }
        },

        execute_regex_search: function (target, response) {
            var pattern = new RegExp(target, 'i');
            var result = [ ];
            var seen   = { };
            var len    = this.code_list.length;
            var code, ch;
            for(var i = 0; i < len; i++) {
                if(result.length > 10) { break; };
                code = this.code_list[i];
                ch   = this.code_chart[code];
                if(
                    pattern.test(ch.description)
                    || (ch.alias && pattern.test(ch.description))
                ) {
                    this.add_result(result, seen, code, ch);
                }
            }
            if(result.length === 0) {
                this.$search_input.removeClass('busy');
            }
            response(result);
        },

        add_result: function (result, seen, code, ch, extra) {
            if(seen[code]) {
                return;
            }
            var cp = hex2dec(code);
            var character = codepoint_to_string(cp);
            var descr = ch.description;
            if(extra) {
                descr = extra + ' ' + descr;
            }
            var $div = $('<div />').text(descr);
            if(ch.alias) {
                $div.append( $('<span class="code-alias" />').text(ch.alias) );
            }
            result.push({
                'cp': cp,
                'character': character,
                'label': '<div class="code-point">U+' + code + '</div>'
                         + '<div class="code-sample">&#160;' + character
                         + '</div><div class="code-descr">' + $div.html()
                         + '</div>'
            });
            seen[code] = true;
        },

        increment_code_point: function (inc) {
            var code = this.curr_cp + inc;
            if(code === -1) {
                this.select_codepoint(null);
                return;
            }
            var hex  = dec2hex(code, 4);
            while(!this.code_chart[hex]) {
                code = code + inc;
                if(code < 0) { return; }
                if(code > this.max_codepoint) { return; }
                hex = dec2hex(code, 4);
            }
            this.select_codepoint(code);
        },

        scroll_char: function (event, delta) {
            if(!event.ctrlKey) {
                this.increment_code_point(delta < 0 ? 1 : -1);
                return;
            }
            var code = this.curr_cp || 0;
            var block = this.block_from_codepoint(code);
            var i = block.index + (delta < 0 ? 1 : -1);
            if(!this.code_blocks[i]) { return; }
            this.select_codepoint(this.code_blocks[i].start_dec);
        },

        display_chart_dialog: function () {
            window.scrollTo(0,0);
            var rect = this.$el[0].getBoundingClientRect();
            this.set_code_chart_page(this.curr_cp);
            this.$chart_dialog
                .dialog('option', 'position', [rect.left - 1, 248])
                .dialog('open');
        },

        set_code_chart_page: function (base_code) {
            base_code = base_code & block_mask;
            if(this.code_chart_base === base_code) {
                return;
            }
            this.code_chart_base = base_code;

            var $dlg = this.$chart_dialog
            $dlg.dialog('option', 'title', 'Unicode Character Chart '
                + dec2hex(base_code, 4) + ' - ' + dec2hex(base_code + 0x7F, 4)
            );

            var $tbody = $('<tbody />');
            var i, j, $row, $cell, meta;
            var cp = base_code;
            for(i = 0; i < 8; i++) {
                $row = $('<tr />');
                for(j = 0; j < 16; j++) {
                    $cell = $('<td />');
                    var ch = this.lookup_char(cp);
                    var show_char = true;
                    var char_class = null;
                    if(!ch) {
                        char_class = 'unassigned';
                    }
                    else if(ch.reserved) {
                        char_class = ch.reserved;
                        show_char  = ch.show;
                    }
                    if(char_class) {
                        $cell.addClass(char_class);
                    }
                    if(show_char) {
                        $cell.text(codepoint_to_string(cp));
                    }
                    $row.append($cell);
                    cp++;
                }
                $tbody.append($row);
            }
            this.$code_chart_table.empty().append($tbody);
            if((this.curr_cp & block_mask) === base_code) {
                this.select_block_name(this.curr_cp);
            }
            else {
                this.select_block_name(base_code);
            }
        },

        highlight_code_chart_char: function () {
            this.set_code_chart_page(this.curr_cp, true);
            if(this.curr_cp !== null) {
                this.$code_chart_table.find('td').removeClass('curr-char');
                var col = (this.curr_cp & 15) + 1;
                var row = ((this.curr_cp >> 4) & 7) + 1;
                var selector = 'tr:nth-child(' + row + ') td:nth-child(' + col + ')';
                this.$code_chart_table.find(selector).addClass('curr-char');
            }
        },

        select_block_name: function (cp) {
            var block = this.block_from_codepoint(cp);
            if(block && this.$blocks_menu.val() !== block.index) {
                this.$blocks_menu.val(block.index);
            }
        },

        code_chart_click: function (td) {
            var $td = $(td);
            var col = $td.prevAll().length;
            var row = $td.parent().prevAll().length;
            this.select_codepoint(this.code_chart_base + row * 16 + col);
        },

        increment_chart_page: function (incr) {
            var code_base = this.code_chart_base;
            if(incr < 0  &&  code_base === 0) {
                return;
            }
            code_base = code_base + (incr * 128);
            this.set_code_chart_page(code_base, true);
            if((this.curr_cp & block_mask) === code_base) {
                this.highlight_code_chart_char();
            }
        },

        save_font: function (new_font) {
            this.$el.find('.needs-font').css({'fontFamily': new_font});
            this.$code_chart_table.css({'fontFamily': new_font});
        },

        load_unicode_data: function (handler) {
            var app = this;
            var data_url = this.opt.data_file_no_unihan;
            $.get(data_url, null, function(data, status) {
                app.parse_unicode_data(data, status, handler);
            }, 'text' );
        },

        parse_unicode_data: function (data, status, handler) {
            var i = 0;
            var j, str, line, field, offset, type, code, range_end, block;
            var curr_cp = 0;
            while(i < data.length) {
                j = data.indexOf("\n", i);
                if(j < 1) { break; }
                line = data.substring(i, j);
                field = line.split("\t");

                // [ line describes a block
                if(line.match(/^\[/)) {
                    field[0] = field[0].replace(/^\[/, '');
                    block = {
                        'start'    : field[0],
                        'end'      : field[1],
                        'start_dec': hex2dec(field[0]),
                        'end_dec'  : hex2dec(field[1]),
                        'title'    : field[2],
                        'filename' : field[3],
                        'pdf_url'  : field[4],
                        'index'    : this.code_blocks.length
                    };
                    this.code_blocks.push(block);
                }

                // & line describes an HTML character entity
                else if(line.match(/^\&/)) {
                    field[0] = field[0].replace(/^\&/, '');
                    this.html_ent[field[0]]  = field[1];    // Map name to code eg: nbsp => 00A0
                    this.html_name[field[1]] = field[0];    // Map code to name eg: 0233 => eacute
                }

                // There may be an offset before the type prefix on these lines
                else {
                    offset = 1;
                    if(field[0].match(/^[+](\d+)/)) {
                        offset = parseInt(RegExp.$1, 10);
                        field[0] = field[0].replace(/^[+]\d+/, '');
                    }
                    curr_cp += offset;
                    if(curr_cp > this.max_codepoint) {
                        this.max_codepoint = curr_cp;
                    }
                    code = dec2hex(curr_cp, 4);

                    type = '"';
                    if(field[0].match(/^(["#%^!*])/)) {
                        type = RegExp.$1;
                        field[0] = field[0].replace(/^["#%^!*]/, '');
                    }

                    switch(type) {

                        // " line describes a character
                        case '"':
                            this.code_chart[code] = {
                                'description': field[0]
                            };
                            if(field[1] && field[1].length > 0) {
                                this.code_chart[code].alias = field[1];
                            }
                            this.code_list.push(code);
                            break;

                        // % line describes a reserved range
                        case '%':
                            range_end = curr_cp + parseInt(field[0], 10) - 1;
                            this.reserved_ranges.push({
                                type: 'unassigned',
                                first_cp: curr_cp,
                                last_cp: range_end
                            });
                            curr_cp = range_end;
                            break;

                        // # line describes a templated character range
                        case '#':
                            range_end = curr_cp + parseInt(field[0], 10) - 1;
                            this.reserved_ranges.push({
                                type: 'templated',
                                first_cp: curr_cp,
                                last_cp: range_end,
                                template: field[1]
                            });
                            curr_cp = range_end;
                            break;

                        // # line describes a surrogate codepoint range
                        case '^':
                            range_end = curr_cp + parseInt(field[0], 10) - 1;
                            this.reserved_ranges.push({
                                type: 'surrogate',
                                first_cp: curr_cp,
                                last_cp: range_end
                            });
                            curr_cp = range_end;
                            break;

                        // * line describes a private use range (PUA)
                        case '*':
                            range_end = curr_cp + parseInt(field[0], 10) - 1;
                            this.reserved_ranges.push({
                                type: 'pua',
                                first_cp: curr_cp,
                                last_cp: range_end
                            });
                            curr_cp = range_end;
                            break;

                        // ! line describes a non-character
                        case '!':
                            range_end = curr_cp + parseInt(field[0], 10) - 1;
                            this.reserved_ranges.push({
                                type: 'noncharacter',
                                first_cp: curr_cp,
                                last_cp: range_end
                            });
                            curr_cp = range_end;
                            break;

                        default:
                            throw "No handler for type: '" + type + "'";
                    }
                }
                i = j + 1;
            }
            handler.call(this);
        },

        block_from_codepoint: function (code) {
            for(var i = 0; i < this.code_blocks.length; i++) {
                if(code > this.code_blocks[i].end_dec){
                    continue;
                }
                if(code < this.code_blocks[i].start_dec){
                    return null;
                }
                return this.code_blocks[i];
            }
            return null;
        }

    };


    /* UnicodeCharacterFinder Plugin Definition
     * ======================================== */

    $.fn.ucf = function(options) {
        options = $.extend($.fn.ucf.defaults, options);

        return this.each(function(x) {
            var app = new UnicodeCharacterFinder(this, options);
            $(this).data('UnicodeCharacterFinder', app);
        });
    };

    $.fn.ucf.defaults = {
        data_file_no_unihan: 'char-data-nounihan.txt'
    };

})(jQuery);

