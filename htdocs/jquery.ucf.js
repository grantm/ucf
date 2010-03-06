
(function($) {
    $.fn.ucf = function(options) {
        options = $.extend($.fn.ucf.defaults, options);

        $(this).each(function(x) {
            $(this).data('options', options);
            load_unicode_data(this);
            build_app(this);
        });

        return this;
    };

    $.fn.ucf.defaults = {
        sample_chars: [ 169, 233, 256, 257, 8364, 8451, 9733, 9731, 119558 ]
    }

    // Data shared across all functions

    var code_chart, code_list, code_blocks;
    var unique_ids = [];

    function gen_id(str) {
        var id = str + (unique_ids.length + 1);
        unique_ids.push(id);
        return id;
    }

    function build_app(app) {
        add_help_dialog(app);

        var form = $('<form class="ucf-app empty"></form>');
        form.submit(function() { return false; });
        $(app).append(form);

        form.append( char_info_pane(app, form) );
        form.append( char_search_field(app, form) );
        form.append( sample_char_links(app) );
        form.append( build_code_chart_dialog(app) );

        $(app).find('input.search').focus();
    }

    function add_help_dialog(app) {
        var sel = $(app).data('options').help_selector;
        if(sel) {
            var help_div = $(sel);
            if(help_div[0]) {
                var help = $('<div class="ucf-tab-help" />');
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
                help.click(function() { help_div.dialog('open'); });
                $(app).append(help);
            }
        }
    }

    function char_search_field(app, form) {
        var div = $('<div class="search-wrap"><label>Search character descriptions:</label><br></div>');
        var inp = $('<input type="text" class="search" />');
        div.append(inp);

        inp.autocomplete({
            delay: 900,
            minLength: 1,
            source: function(request, response) {
                var target = request.term;
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
                var char_inp = $(app).find('input.char');
                char_inp.val(ui.item.character);
                char_changed(app, char_inp);
                window.scrollTo(0,0);
                return false;
            }
        })

        return div;
    }

    function char_info_pane(app, form) {
        var div = $('<div class="char-wrap"></div>');

        var panel1 = $('<div class="char-preview"></div>');
        var label1 = $('<div class="char-preview-label">Character<br />Preview</div>');
        var inp = $('<input type="text" class="char" title="Type or paste a character" />');
        var span = $('<span class="char-buttons" />')
        span.append(
            $('<button type="button" class="char-prev" title="Previous character">&#9666;</button>'),
            $('<button type="button" class="char-menu" title="Show code chart">&#9662;</button>'),
            $('<button type="button" class="char-next" title="Next character">&#9656;</button>')
        );

        panel1.append( label1, inp, span );

        var cb = function() { char_changed(app, inp) };
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
        table.click(function(e) { code_chart_click(e, app) });

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
            var inp = $(app).find('input.char');
            inp.val($(this).text());
            char_changed(app, inp);
        });
        return div;
    }

    function execute_search(target, app, response, inp) {
        target     = target.toUpperCase();
        var result = [ ];
        var len    = code_list.length;
        var code, char, character, div;
        for(var i = 0; i < len; i++) {
            if(result.length > 10) { break };
            code = code_list[i];
            char = code_chart[code];
            if(
                char.description.indexOf(target) >= 0
                || (char.alias && char.alias.indexOf(target) >= 0)
            ) {
                character = codepoint_to_string(hex2dec(code));
                div = $('<div />').text(char.description);
                if(char.alias) {
                    div.append( $('<span class="code-alias" />').text(char.alias) );
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
        var code, char, character, div;
        for(var i = 0; i < len; i++) {
            if(result.length > 10) { break };
            code = code_list[i];
            char = code_chart[code];
            if(
                pattern.test(char.description)
                || (char.alias && pattern.test(char.description))
            ) {
                character = codepoint_to_string(hex2dec(code));
                div = $('<div />').text(char.description);
                if(char.alias) {
                    div.append( $('<span class="code-alias" />').text(char.alias) );
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
        var char = inp.val();
        if(char == $app.data('last_char')) {
            return;
        }
        if(char.length == 0) {
            $(app).find('div.char-info');
            return;
        }
        $app.data('last_char', char);
        var code  = string_to_codepoint(char);
        var hex   = dec2hex(code, 4);
        var block = codepoint_to_block(app, code);
        char      = code_chart[hex];

        var table = $('<table />')
        table.append(
            $('<tr />').append(
                $('<th />').text('Code point'),
                $('<td />').text('U+' + hex)
            )
        );
        if(char && char.description.length > 0) {
            var td = $('<td />').text(char.description);
            if(char.alias) {
                td.append(
                    $('<br />'),
                    $('<span class="alias"/>').text(char.alias)
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
        var char = $(app).data('last_char');
        if(!char) { return; }
        var code = string_to_codepoint(char) + inc;
        var hex  = dec2hex(code, 4);
        while(!code_chart[hex]) {
            code = code + inc;
            if(code < 0) { return; }
            hex = dec2hex(code, 4);
        }
        inp.val(codepoint_to_string(code));
        examine_char(app, inp);
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

    function code_chart_click(e, app) {
        var table_rect = e.currentTarget.getBoundingClientRect();
        var td = e.originalTarget;
        var code = $(app).data('code_chart_base');
        $(td).prevAll().each(function() { code++; });
        $(td).parent().prevAll().each(function() { code += 16; });
        var char_inp = $(app).find('input.char');
        char_inp.val(codepoint_to_string(code));
        char_changed(app, char_inp);
        $(e.currentTarget).find('td').removeClass('curr-char');
        $(e.originalTarget).addClass('curr-char');
    }

    function change_chart_page(app, incr) {
        var code_base = $(app).data('code_chart_base');
        if(incr < 0  &&  code_base == 0) {
            return;
        }
        code_base = code_base + (incr * 128);
        set_code_chart_page(app, code_base, null);
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
                    'pdf_url'  : row[5],
                };
                blocks.push(block);
            }
            else {
                code = row.shift();
                chart[code] = {
                    'description': row[0],
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
                return;
            }
            return code_blocks[i];
        }
        return;
    }

})(jQuery);

