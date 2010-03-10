/*
 * Unicode Character Finder
 * Copyright (c) 2010 Grant McLean
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
    $.fn.ucf = function(options) {
        options = $.extend($.fn.ucf.defaults, options);

        $(this).each(function(x) {
            $(this).data('options', options);
            build_app(this);
        });

        return this;
    };

    $.fn.ucf.defaults = {
        sample_chars: [ 169, 233, 256, 257, 8364, 8451, 9733, 9731, 119558 ]
    };

    // Data shared across all functions

    var code_chart, code_list, code_blocks;
    var unique_ids = [];

    function gen_id(str) {
        var id = str + (unique_ids.length + 1);
        unique_ids.push(id);
        return id;
    }

    function build_app(app) {
        var $app = $(app);
        $app.hide();
        start_loading_splash(app);

        load_unicode_data(app);

        add_font_dialog(app);
        add_help_dialog(app);

        var form = $('<form class="ucf-app empty"></form>');
        form.submit(function() { return false; });
        $app.append(form);

        form.append( char_info_pane(app, form) );
        form.append( char_search_field(app, form) );
        form.append( sample_char_links(app) );
        form.append( build_code_chart_dialog(app) );
    }

    function start_loading_splash(app) {
        var id  = gen_id('ucf-splash-dlg');
        var div = $('<div class="ucf-splash-dlg"/>').attr('id', id);
        div.append('<p class="ucf-loading">Please wait &#8230; </p>');
        $(app).data('splash_dlg_id', id);
        div.dialog({
            autoOpen:      true,
            title:         "Loading",
            resizable:     false,
            closeOnEscape: false,
            modal:         true,
            width:         350,
            height:        150
        });
        div.ajaxError(function(e, req, settings, error) {
            $(this).html(
                '<p class="error">'
                + '<span class="ui-icon ui-icon-alert"></span>'
                + 'Failed to load Unicode character data.</p>'
                + '<p>Have you run <code>make-data-file</code>?</p>'
            );
        });
    }

    function enable_ui(app) {
        $('#' + $(app).data('splash_dlg_id'))
            .dialog('close');
        $(app).slideDown(600, function() {
            $(app).find('input.search').focus();
        });
        process_querystring(app);
    }

    function process_querystring(app) {
        var args = jQuery.deparam(jQuery.param.querystring());
        // c=U+XXXX
        if(args.c && args.c.match(/^U[ +]([0-9A-Fa-f]{4,7})$/)) {
            set_preview_char(app, codepoint_to_string( hex2dec(RegExp.$1) ) );
        }
        // c=999
        else if(args.c && args.c.match(/^(\d+){1,9}$/)) {
            set_preview_char(app, codepoint_to_string( parseInt(RegExp.$1) ) );
        }
        // c=uXXXXuXXXX
        else if(args.c && args.c.match(/^u([0-9A-Fa-f]{4})u([0-9A-Fa-f]{4})$/)) {
            var str = String.fromCharCode( hex2dec(RegExp.$1) )
                    + String.fromCharCode( hex2dec(RegExp.$2) );
            set_preview_char(app, str );
        }
        // q=????
        else if(args.q) {
            var inp = $('input.search', app);
            inp.val(args.q);
            inp.autocomplete('search');
        }
    }

    function set_preview_char(app, new_char) {
        var inp = $('input.char', app);
        inp.val(new_char);
        char_changed(app, inp);
    }

    function add_font_dialog(app) {
        var $app = $(app);
        var font_tab = $('<div class="ucf-tab-font" />');
        $app.append(font_tab);

        var div = $('<div class="ucf-font-menu" />');
        $app.data('font_dlg_id', gen_id('ucf-font-dlg'));
        div.attr('id', $app.data('font_dlg_id'));
        var inp = $('<input type="text" class="ucf-font" />')
            .css({'width': '180px'});;
        div.append(
            $('<p>Font name</p>'),
            inp
        );

        div.dialog({
            autoOpen:      false,
            title:         "Font Selection",
            resizable:     false,
            closeOnEscape: true,
            width:         220,
            height:        160,
            buttons:       {
                "Save":  function() {
                    save_font(app, inp);
                    $(this).dialog("close");
                },
                "Cancel": function() { $(this).dialog("close"); }
            }
        });

        font_tab.click(function() { div.dialog('open'); });
    }

    function add_help_dialog(app) {
        var sel = $(app).data('options').help_selector;
        if(sel) {
            var help_div = $(sel);
            if(help_div[0]) {
                var help_tab = $('<div class="ucf-tab-help" />');
                help_div.dialog({
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
                help_tab.click(function() { help_div.dialog('open'); });
                $(app).append(help_tab);
            }
        }
    }

    function char_search_field(app, form) {
        var div = $(
            '<div class="search-wrap empty"><label>Search character descriptions:'
            + '<a class="search-link" title="Link to this search">&#167;</a>'
            + '</label><br></div>'
        );
        var inp = $('<input type="text" class="search" />');
        div.append(inp);

        inp.autocomplete({
            delay: 900,
            minLength: 1,
            source: function(request, response) {
                var target = request.term;
                set_search_link(app);
                if(target != '') {
                    var search_func = execute_search;
                    if(target.charAt(0) == '/') {
                        if(target.length < 3 || target.charAt(target.length - 1) != '/') {
                            return;
                        }
                        target = target.substr(1, target.length - 2);
                        search_func = execute_regex_search;
                    }
                    inp.addClass('busy');
                    setTimeout(function() {
                        search_func(target, app, response, inp);
                    }, 2 );
                }
            },
            open: function(e, ui) {
                inp.removeClass('busy');
            },
            focus: function(e, ui) {
                return false;
            },
            select: function(e, ui) {
                set_preview_char(app, ui.item.character);
                window.scrollTo(0,0);
                return false;
            }
        });

        inp.keyup(function() { set_search_link(app); });
        inp.blur( function() { set_search_link(app); });

        return div;
    }

    function set_search_link(app) {
        var str = $('input.search', app).val();
        if(str.length == 0) {
            $('div.search-wrap', app).addClass('empty');
        }
        else {
            $('div.search-wrap', app).removeClass('empty');
            var link = jQuery.param.querystring('?', { q: str });
            $('a.search-link', app).attr('href', link);
        }
    }

    function char_info_pane(app, form) {
        var div = $('<div class="char-wrap"></div>');

        var panel1 = $('<div class="char-preview"></div>');
        var label1 = $('<div class="char-preview-label">Character<br />Preview</div>');
        var inp = $('<input type="text" class="char needs-font" title="Type or paste a character" />');
        var span = $('<span class="char-buttons" />');
        span.append(
            $('<button type="button" class="char-prev" title="Previous character">&#9666;</button>'),
            $('<button type="button" class="char-menu" title="Show code chart">&#9662;</button>'),
            $('<button type="button" class="char-next" title="Next character">&#9656;</button>'),
            $('<a class="char-link" title="Link to this character">&#167;</a>')
        );

        panel1.append( label1, inp, span );

        var cb = function() { char_changed(app, inp); };
        inp.change( cb );
        inp.keypress(function(event) { setTimeout(cb, 50); });
        inp.mouseup(function(event) { setTimeout(cb, 50); });

        panel1.find('button.char-prev').click(function() {
            increment_code_point(app, inp, -1);
        });
        panel1.find('button.char-menu').click(function() {
            display_chart_menu(app);
        });
        panel1.find('button.char-next').click(function() {
            increment_code_point(app, inp, 1);
        });

        var panel2 = $('<div class="char-props"></div>');
        var label2 = $('<div class="char-props-label">Character<br />Properties</div>');
        var info   = $('<div class="char-info"></div>');
        panel2.append(label2, info);

        div.append(panel1, panel2);

        return div;
    }

    function build_code_chart_dialog(app) {
        var $app = $(app);
        var table = $('<table class="ucf-code-chart"></table>');
        table.delegate('td', 'click', function() { code_chart_click(this, app); });

        var chart_menu = $('<div class="ucf-chart-menu" />');
        $app.data('chart_dlg_id', gen_id('ucf-chart-dlg'));
        chart_menu.attr('id', $app.data('chart_dlg_id'));
        chart_menu.append(table);

        chart_menu.dialog({
            autoOpen:      false,
            title:         "Unicode Character Chart",
            resizable:     false,
            closeOnEscape: true,
            width:         555,
            height:        320,
            buttons:       {
                "Close": function() { $(this).dialog("close"); },
                "Next":  function() { change_chart_page(app, 1); },
                "Prev":  function() { change_chart_page(app, -1); }
            }
        });
    }

    function sample_char_links(app) {
        var chars = $(app).data('options').sample_chars;

        var div = $(
            '<div class="sample-wrap" title="click character to select">'
            + 'Examples &#8230; </div>'
        );

        var list = $('<ul></ul>');
        for(i = 0; i < chars.length; i++) {
            var item = $('<li></li>');
            item.text(codepoint_to_string(chars[i]));
            list.append(item);
        }
        div.append(list);

        list.find('li').click(function (event) {
            set_preview_char(app, $(this).text());
        });
        return div;
    }

    function execute_search(target, app, response, inp) {
        target     = target.toUpperCase();
        var result = [ ];
        var len    = code_list.length;
        var code, ch, character, div;
        for(var i = 0; i < len; i++) {
            if(result.length > 10) { break; };
            code = code_list[i];
            ch = code_chart[code];
            if(
                ch.description.indexOf(target) >= 0
                || (ch.alias && ch.alias.indexOf(target) >= 0)
            ) {
                character = codepoint_to_string(hex2dec(code));
                div = $('<div />').text(ch.description);
                if(ch.alias) {
                    div.append( $('<span class="code-alias" />').text(ch.alias) );
                }
                result.push({
                    'code': code,
                    'character': character,
                    'label': '<div class="code-point">U+' + code + '</div>'
                             + '<div class="code-sample">&#160;' + character
                             + '</div><div class="code-descr">' + div.html()
                             + '</div>'
                });
            }
        }
        if(result.length == 0) {
            inp.removeClass('busy');
        }
        response(result);
    }

    function execute_regex_search(target, app, response, inp) {
        var pattern = new RegExp(target, 'i');
        var result = [ ];
        var len    = code_list.length;
        var code, ch, character, div;
        for(var i = 0; i < len; i++) {
            if(result.length > 10) { break; };
            code = code_list[i];
            ch = code_chart[code];
            if(
                pattern.test(ch.description)
                || (ch.alias && pattern.test(ch.description))
            ) {
                character = codepoint_to_string(hex2dec(code));
                div = $('<div />').text(ch.description);
                if(ch.alias) {
                    div.append( $('<span class="code-alias" />').text(ch.alias) );
                }
                result.push({
                    'code': code,
                    'character': character,
                    'label': '<div class="code-point">U+' + code + '</div>'
                             + '<div class="code-sample">&#160;' + character
                             + '</div><div class="code-descr">' + div.html()
                             + '</div>'
                });
            }
        }
        if(result.length == 0) {
            inp.removeClass('busy');
        }
        response(result);
    }

    function char_changed(app, inp) {
        var txt = inp.val();
        var len = txt.length;
        if(len == 0) {
            $(app).find('form').addClass('empty');
        }
        else {
            $(app).find('form').removeClass('empty');
        }
        if(len > 1) {
            if((txt.charCodeAt(len - 2) & 0xF800) == 0xD800) {
                inp.val(txt.substr(txt.length - 2, 2));
            }
            else {
                inp.val(txt.substr(txt.length - 1, 1));
            }
        }
        examine_char(app, inp);
    }

    function examine_char(app, inp) {
        var $app = $(app);
        var ch = inp.val();
        if(ch == $app.data('last_char')) {
            return;
        }
        if(ch.length == 0) {
            $(app).find('div.char-info');
            return;
        }
        $app.data('last_char', ch);
        var code  = string_to_codepoint(ch);
        var hex   = dec2hex(code, 4);
        var block = codepoint_to_block(app, code);
        ch      = code_chart[hex];
        $app.find('a.char-link').attr('href', '?c=U+' + hex);

        var table = $('<table />');
        table.append(
            $('<tr />').append(
                $('<th />').text('Code point'),
                $('<td />').text('U+' + hex)
            )
        );
        if(ch && ch.description.length > 0) {
            var td = $('<td />').text(ch.description);
            if(ch.alias) {
                td.append(
                    $('<br />'),
                    $('<span class="alias"/>').text(ch.alias)
                );
            }
            table.append(
                $('<tr />').append( $('<th />').text('Description'), td )
            );
        }
        table.append(
            $('<tr />').append(
                $('<th />').text('HTML entity'),
                $('<td />').text('&#' + code + ';')
            )
        );
        table.append(
            $('<tr />').append(
                $('<th />').text('UTF-8'),
                $('<td />').text(dec2utf8(code))
            )
        );
        table.append(
            $('<tr />').append(
                $('<th />').text('UTF-16'),
                $('<td />').text(dec2utf16(code))
            )
        );
        if(block) {
            var pdf_link = $('<a />')
                .text(block.title)
                .attr('href', block.pdf_url)
                .attr('title', block.filename + ' at Unicode.org');
            table.append(
                $('<tr />').append(
                    $('<th />').text('Character block'),
                    $('<td />').append(pdf_link)
                )
            );
        }
        $app.find('div.char-info').empty().append(table);
    }

    function increment_code_point(app, inp, inc) {
        var ch = $(app).data('last_char');
        if(!ch) { return; }
        var code = string_to_codepoint(ch) + inc;
        var hex  = dec2hex(code, 4);
        while(!code_chart[hex]) {
            code = code + inc;
            if(code < 0) { return; }
            hex = dec2hex(code, 4);
        }
        set_preview_char(app, codepoint_to_string(code));
    }

    function display_chart_menu(app) {
        window.scrollTo(0,0);
        var char_inp = $(app).find('input.char');
        var code = string_to_codepoint(char_inp.val());
        var rect = $(app)[0].getBoundingClientRect();
        set_code_chart_page(app, null, code);
        $('#' + $(app).data('chart_dlg_id'))
            .dialog('option', 'position', [rect.left - 1, 248])
            .dialog('open');
    }

    function set_code_chart_page(app, code, target_code) {
        if(code == null) {
            code  = target_code & 0xFFF80;
        }
        $(app).data('code_chart_base', code);

        var tbody = $('<tbody />');
        var i, j, row, cell, meta;
        for(i = 0; i < 8; i++) {
            row = $('<tr />');
            for(j = 0; j < 16; j++) {
                cell = $('<td />');
                meta = code_chart[dec2hex(code, 4)];
                if(meta) {
                    cell.text(codepoint_to_string(code));
                    if(code == target_code) {
                        cell.addClass('curr-char');
                    }
                }
                else {
                    cell.addClass('reserved');
                }
                row.append(cell);
                code++;
            }
            tbody.append(row);
        }
        $('#' + $(app).data('chart_dlg_id') + ' table.ucf-code-chart')
            .empty()
            .append(tbody);
    }

    function code_chart_click(el, app) {
        var $el = $(el);
        var code = $(app).data('code_chart_base');
        $el.prevAll().each(function() { code++; });
        $el.parent().prevAll().each(function() { code += 16; });
        set_preview_char(app, codepoint_to_string(code));
        $el.parent().parent().find('td').removeClass('curr-char');
        $el.addClass('curr-char');
    }

    function change_chart_page(app, incr) {
        var code_base = $(app).data('code_chart_base');
        if(incr < 0  &&  code_base == 0) {
            return;
        }
        code_base = code_base + (incr * 128);
        set_code_chart_page(app, code_base, null);
    }

    function save_font(app, inp) {
        var new_font = inp.val();
        $(app).find('.needs-font').css({'fontFamily': new_font});
        $('#' + $(app).data('chart_dlg_id') + ' table.ucf-code-chart')
            .css({'fontFamily': new_font});
    }

    function dec2hex(dec, len) {
        var hex = dec.toString(16).toUpperCase();
        while (hex.length < len) { hex = "0" + hex; }
        return hex;
    }

    function hex2dec(hex) {
        return parseInt(hex, 16);
    }

    function load_unicode_data(app) {
        $.get('./char-data.txt', null, function(data, status) {
            parse_unicode_data(app, data, status);
        }, 'text' );
    }

	function dec2utf8(dec) {
		if (dec < 0x80) {
			return dec2hex(dec,2);
		}
		if (dec < 0x800) {
			return dec2hex(0xC0 | (dec >> 6), 2) + " " +
				dec2hex(0x80 | (dec & 0x3F), 2);
		}
		if (dec < 0x10000) {
			return dec2hex(0xE0 | (dec >> 12), 2) + " " +
				dec2hex(0x80 | ((dec >> 6)) & 0x3F, 2) + " " +
				dec2hex(0x80 | (dec & 0x3F), 2);
		}
		if (dec < 0x110000) {
			return dec2hex(0xF0 | (dec >> 18), 2) + " " +
				dec2hex(0x80 | ((dec >> 12) & 0x3F), 2) + " " +
				dec2hex(0x80 | ((dec >> 6) & 0x3F), 2) + " " +
				dec2hex(0x80 | (dec & 0x3F), 2);			
		}
		return "unknown";
	}

	function dec2utf16(dec) {
		if (dec < 0x10000) {
			return dec2hex(dec, 4);
		}
		if (dec < 0x110000) {
			dec = dec - 0x10000;
			return dec2hex(0xD800 | (dec >> 10), 4) + " " +
				dec2hex(0xDC00 | (dec & 0x3FF), 4);
		}
		return "unknown";
	}

    function parse_unicode_data(app, data, status) {
        var i = 0;
        var chart  = { };
        var codes  = [ ];
        var blocks = [ ];
        var j, str, row, code, block;
        while(i < data.length) {
            j = data.indexOf("\n", i);
            if(j < 1) { break; }
            row = data.substring(i, j).split("\t");
            if(row[0] == 'BLK') {
                block = {
                    'start'    : row[1],
                    'end'      : row[2],
                    'start_dec': hex2dec(row[1]),
                    'end_dec'  : hex2dec(row[2]),
                    'title'    : row[3],
                    'filename' : row[4],
                    'pdf_url'  : row[5]
                };
                blocks.push(block);
            }
            else {
                code = row.shift();
                chart[code] = {
                    'description': row[0]
                };
                if(row[1] && row[1].length > 0) {
                    chart[code].alias = row[1];
                }
                codes.push(code);
            }
            i = j + 1;
        }
        code_list   = codes;
        code_blocks = blocks;
        code_chart  = chart;
        enable_ui(app);
    }

    function codepoint_to_string(i) {
        if(i < 65536) {
            return String.fromCharCode(i);
        }
        var hi = Math.floor((i - 0x10000) / 0x400) + 0xD800;
        var lo = ((i - 0x10000) % 0x400) + 0xDC00;
        return String.fromCharCode(hi) + String.fromCharCode(lo);
    }

    function string_to_codepoint(str) {
        var hi = str.charCodeAt(0);
        if((hi & 0xF800) != 0xD800) {
            return hi;
        }
        var lo = str.charCodeAt(1);
        return ((hi - 0xD800) * 0x400) + (lo - 0xDC00) + 0x10000;
    }

    function codepoint_to_block(app, code) {
        for(i = 0; i < code_blocks.length; i++) {
            if(code > code_blocks[i].end_dec){
                continue;
            }
            if(code < code_blocks[i].start){
                return null;
            }
            return code_blocks[i];
        }
        return null;
    }

})(jQuery);

