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
    var key = {
        ArrowUp:    38,
        ArrowDown:  40,
        Enter:      13
    };


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

    function utf8hex2dec(str) {
        str = str.toUpperCase().replace(/\s+/g, '');
        if(!str.match(/^(?:[0-9A-F]{2})+$/g)) { return null; }
        var hex = str.match(/([0-9A-F]{2})/g);
        var dec, i, j;
        var bytes = [];
        for(i = 0; i < hex.length; i++) {
            bytes.push(parseInt(hex[i], 16));
        }
        dec = bytes.shift();
        i = 0;
        if(dec > 127) {
            if((dec & 0xE0) === 0xC0) {
                dec = dec & 0x1F;
                i = 1;
            }
            else if((dec & 0xF0) === 0xE0) {
                dec = dec & 0x0F;
                i = 2;
            }
            else if((dec & 0xF8) === 0xF0) {
                dec = dec & 0x07;
                i = 3;
            }
            else if((dec & 0xFC) === 0xF8) {
                dec = dec & 0x03;
                i = 4;
            }
            else {
                return null;
            }
        }
        while(i > 0) {
            if(bytes.length === 0) {
                return null;
            }
            j = bytes.shift();
            if((j & 0xC0) !== 0x80) {
                return null;
            }
            dec = (dec << 6) + (j & 0x3F);
            i--;
        }
        return dec;
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
        html_entities:    [ ],
        unique_ids:       [ ],
        max_codepoint:    0,

        build_ui: function () {
            this.start_loading_splash();

            this.load_unicode_data( this.enable_ui ); // callback when done

            this.add_font_dialog();
            this.add_help_dialog();
            this.add_code_chart_dialog();
            this.add_form_elements();
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
            this.$el.addClass('ready');
            this.select_codepoint(null);
            this.process_querystring();
            $(window).on('popstate', function() {
                app.select_codepoint(null)
                app.reset_search();
                app.process_querystring();
            });
        },

        process_querystring: function () {
            var args = queryString.parse(location.search);
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
                this.$search_input.val(args.q).focus();
                this.trigger_search();
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
                    'description':  desc,
                    'cp':           cp
                };
            }
            var ch = {
                'cp':           cp,
                'reserved':     range.type,
                'range_start':  range.first_cp,
                'range_end':    range.last_cp,
            };
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
                    $('<td />').append(
                        $('<a />')
                            .attr('href', 'https://codepoints.net/U+' + hex)
                            .text('U+' + hex)
                    )
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
                if(ch.entity_name) {
                    entity = entity + ' or &' + ch.entity_name + ';';
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
                        width:         700,
                        height:        400,
                        buttons:       {
                            "Close": function() { $(this).dialog("close"); }
                        }
                    });
                    $help_tab.click(function() {
                        $div.dialog('open');
                        $(sel).scrollTop(0)
                    });
                    this.$el.append($help_tab);
                }
            }
        },

        char_search_field: function () {
            this.$search_wrapper = $('<div />').addClass("search-wrap state-empty")
                .append(
                    $('<label />').text('Search character descriptions:'),
                    this.build_search_link(),
                    this.build_search_reset(),
                    this.build_search_input(),
                    this.build_search_results()
                );
            this.add_sample_chars()
            this.init_search_input();
            return this.$search_wrapper;
        },

        build_search_link: function () {
            var app = this;
            return this.$search_link =
                $('<a class="search-link" title="Link to this search" >&#167;</a>')
                    .click(function(e) { app.push_to_link(e, this.href); });
        },

        push_to_link: function (e, url) {
            window.history.pushState({}, this.opt.title, url);
            e.preventDefault();
        },

        build_search_reset: function () {
            var app = this;
            return $('<span>&#9003;</span>')
                .addClass("search-reset ui-widget")
                .attr('title', 'Clear the current search')
                .click(function () {
                    app.reset_search();
                });
        },

        build_search_input: function () {
            return this.$search_input = $('<input type="text" />')
                .addClass("search ui-autocomplete-input");
        },

        build_search_results: function () {
            var app = this;
            this.$search_results =
                $('<ul />').addClass('result-items ui-autocomplete ui-menu  ui-widget ui-widget-content')
                    .on('click', 'li', function() {
                        app.select_search_item(this);
                    });
            var $div = $('<div />').addClass('search-results').append(
                this.$search_results,
                $('<div />').addClass('search-footer ui-widget').append(
                    $('<span />').addClass('throbber').text('Searching ...'),
                    $('<span />').addClass('partial').text('More ...'),
                    $('<span />').addClass('complete').text('Search complete')
                ).click(function() {
                    app.find_more_results();
                })
            );
            return $div;
        },

        init_search_input: function () {
            var app = this;
            this.$search_input.on(
                "keydown keypress input paste",
                function(e) {
                    if(!app.handle_search_cursor_keys(e)) {
                        app.trigger_search();
                    }
                }
            );
        },

        reset_search: function () {
            this.search = null;
            this.clear_search_results();
            this.$search_input.val('').focus();
            this.set_search_state('empty');
        },

        clear_search_results: function () {
            this.$search_results.empty();
        },

        handle_search_cursor_keys: function (e) {
            if(e.type !== 'keydown') { return false; }
            var $li = this.$search_results.find('li.selected');
            if($li.length === 0) {
                $li = null;
            }
            if(e.which === key.ArrowDown) {
                if($li) {
                    $li = $li.next();
                }
                else {
                    $li = this.$search_results.find('li:nth-child(1)');
                }
            }
            else if(e.which === key.ArrowUp) {
                if($li) {
                    $li = $li.prev();
                }
            }
            else if(e.which === key.Enter) {
                if($li) {
                    this.select_search_item($li);
                }
            }
            else {
                return false;
            }
            e.preventDefault();
            if($li && $li.length > 0) {
                this.$search_results.find('li.selected').removeClass('selected');
                $li.addClass('selected');
            }
            return true;
        },

        trigger_search: function () {
            var app = this;
            this.set_search_link();
            if(app.search_pending) {
                clearTimeout(app.search_pending);
            }
            app.search_pending = setTimeout(
                function() {
                    delete app.search_pending;
                    app.start_search();
                },
                this.opt.search_delay || 800
            );
        },

        start_search: function () {
            var query = this.$search_input.val();
            if(this.search && this.search.query === query) {
                return;
            }
            this.clear_search_results();
            if(query === '') {
                this.set_search_state('empty');
                delete this.search;
                return;
            }
            this.search = {
                "query":  query,
                "index":  0,
                "seen":   {}
            };
            if(query.charAt(0) === '/') {
                if(query.length < 3 || query.charAt(query.length - 1) !== '/') {
                    return;
                }
                query = query.substr(1, query.length - 2);
                this.search.regex = new RegExp(query, 'i');
                this.search.exact_matches = [];
            }
            else {
                this.search.uquery = query.toUpperCase();
                this.search.exact_matches = this.exact_matches();
            }
            this.find_more_results();
        },

        find_more_results: function () {
            if(!this.search) {
                return;
            }
            if(this.search.done) {
                this.set_search_state('complete');
                return;
            }
            this.set_search_state('searching');
            for(var i = 0; i < 10; i++) {
                var ch = this.next_match();
                if(!ch) {
                    break;
                }
                var character = codepoint_to_string(ch.cp);
                var code = dec2hex(ch.cp, 4);
                var $desc = $('<div />').addClass('code-descr').text(ch.description);
                if(ch.alias) {
                    $desc.append( $('<span class="code-alias" />').text(ch.alias) );
                }
                if(ch.prefix) {
                    $desc.prepend( $('<span class="prefix" />').text(ch.prefix) );
                }
                this.$search_results.append(
                    $('<li>').addClass('ui-menu-item').attr('role', 'menuitem')
                        .data('codepoint', ch.cp)
                        .append(
                            $('<div />').addClass('code-point').text('U+' + code),
                            $('<div />').addClass('code-sample').text("\u00A0" + character),
                            $desc
                        )
                );
            }
            if(this.search.done) {
                this.set_search_state('complete');
            }
            else {
                this.set_search_state('partial');
            }
        },

        next_match: function () {
            var s = this.search;
            var m, code, ch, prefix;
            if(s.exact_matches.length > 0) {
                m = s.exact_matches.shift();
                prefix =  m[1] === '' ? '' : '[' + m[1] + '] ';
                ch = $.extend({}, m[0], {'prefix': prefix});
                s.seen[ch.cp] = true;
                return ch;
            }
            while(s.index < this.code_list.length) {
                code = this.code_list[s.index];
                ch   = this.code_chart[code];
                s.index++;
                if(s.seen[ch.cp]) {
                    continue;
                }
                if(s.regex) {
                    if(
                        s.regex.test(ch.description)
                        || (ch.alias && s.regex.test(ch.alias))
                    ) {
                        return ch;
                    }
                }
                else {
                    if(
                        ch.description.indexOf(s.uquery) >= 0
                        || (ch.alias && ch.alias.indexOf(s.uquery) >= 0)
                    ) {
                        return ch;
                    }
                }
            }
            s.done = true;
            return null;
        },

        exact_matches: function () {
            var cp, hex, ch;
            var matches = [];
            var query = this.search.query;
            var uquery = this.search.uquery;
            if(query.match(/^&#(\d+);?$/) || query.match(/^(\d+)$/)) {
                cp = parseInt(RegExp.$1, 10);
                ch = this.lookup_char(cp);
                if(ch) {
                    matches.push([ch, 'Decimal: ' + cp]);
                }
            }
            if(query.match(/^&#x([0-9a-f]+);?$/i) || query.match(/^(?:U[+])?([0-9a-f]+)$/i)) {
                cp = hex2dec(RegExp.$1);
                ch = this.lookup_char(cp);
                if(ch) {
                    matches.push([ch, '']);
                }
            }
            cp = utf8hex2dec(query);
            if(cp && cp > 127) {
                ch = this.lookup_char(cp);
                if(ch) {
                    matches.push([ch, 'UTF8 Hex: ' + dec2utf8(cp)]);
                }
            }
            if(query.match(/^(?:&#?)?(\w+);?$/)) {
                query = RegExp.$1;
            }
            for(var i = 0; i < this.html_entities.length; i++) {
                var ent = this.html_entities[i];
                if(ent.name === query) {
                    matches.unshift([this.lookup_char(ent.cp), '&' + ent.name + ';']);
                }
                else if(ent.uname === uquery) {
                    matches.push([this.lookup_char(ent.cp), '&' + ent.name + ';']);
                }
            }

            return matches;
        },

        select_search_item: function (item) {
            var $item = $(item);
            this.select_codepoint( $item.data('codepoint') );
            this.$search_results.find('li.selected').removeClass('selected');
            $item.addClass('selected');
            window.scrollTo(0,0);
            this.$search_input.focus();
        },

        set_search_link: function () {
            var str = this.$search_input.val();
            var link = '?' + queryString.stringify({ q: str });
            this.$search_link.attr('href', link);
        },

        set_search_state: function (state) {
            this.$search_wrapper.removeClass('state-empty state-searching state-partial state-complete');
            this.$search_wrapper.addClass('state-' + state);
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
                    .html('&#167;')
                    .click(function(e) { app.push_to_link(e, this.href); });
            return $('<span class="char-buttons" />').append(
                this.$prev_char_btn,
                this.$char_menu_btn,
                this.$next_char_btn,
                this.$char_link
            );
        },

        add_sample_chars: function () {
            if(this.opt.sample_chars) {
                this.$search_wrapper.append( this.sample_char_links() );
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
                width:         580,
                height:        320,
            })
            .dialog( "option", "position", { my: "center center", at: "center center", of: "body" } );
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

        increment_code_point: function (inc) {
            var cp = this.curr_cp + inc;
            if(cp === -1) {
                this.select_codepoint(null);
                return;
            }
            var ch = this.lookup_char(cp);
            if(!ch.reserved || ch.show) {
                this.select_codepoint(cp);
                return;
            };
            if(ch.reserved) {
                // recurse to handle adjacent reserved blocks
                this.curr_cp = (inc < 0 ? ch.range_start : ch.range_end);
                return this.increment_code_point(inc);
            }
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
            var j, str, line, field, offset, type, code, ent_name, range_end, block;
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
                                description:  field[0],
                                cp:           curr_cp
                            };
                            if(field[1] && field[1].match(/^&(\w+);/)) {
                                var ent_name = RegExp.$1;
                                this.html_entities.push({
                                    'name':   ent_name,
                                    'uname':  ent_name.toUpperCase(),
                                    'cp':     curr_cp
                                });
                                this.code_chart[code].entity_name = ent_name;
                                field[1] = field[1].replace(/^&\w+;/, '')
                            }
                            if(field[1] && field[1].length > 0) {
                                this.code_chart[code].alias = field[1];
                            }
                            this.code_list.push(code);
                            break;

                        // % line describes a reserved range
                        case '%':
                            range_end = curr_cp + parseInt(field[0], 10) - 1;
                            this.reserved_ranges.push({
                                type:     'unassigned',
                                first_cp: curr_cp,
                                last_cp:  range_end
                            });
                            curr_cp = range_end;
                            break;

                        // # line describes a templated character range
                        case '#':
                            range_end = curr_cp + parseInt(field[0], 10) - 1;
                            this.reserved_ranges.push({
                                type:     'templated',
                                first_cp: curr_cp,
                                last_cp:  range_end,
                                template: field[1]
                            });
                            curr_cp = range_end;
                            break;

                        // # line describes a surrogate codepoint range
                        case '^':
                            range_end = curr_cp + parseInt(field[0], 10) - 1;
                            this.reserved_ranges.push({
                                type:     'surrogate',
                                first_cp: curr_cp,
                                last_cp:  range_end
                            });
                            curr_cp = range_end;
                            break;

                        // * line describes a private use range (PUA)
                        case '*':
                            range_end = curr_cp + parseInt(field[0], 10) - 1;
                            this.reserved_ranges.push({
                                type:     'pua',
                                first_cp: curr_cp,
                                last_cp:  range_end
                            });
                            curr_cp = range_end;
                            break;

                        // ! line describes a non-character
                        case '!':
                            range_end = curr_cp + parseInt(field[0], 10) - 1;
                            this.reserved_ranges.push({
                                type:     'noncharacter',
                                first_cp: curr_cp,
                                last_cp:  range_end
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
        title:                'Unicode Character Finder',
        search_delay:         800,
        data_file_no_unihan:  'char-data-nounihan.txt'
    };

})(jQuery);

