'use strict';

var evnt = {
	addEvent      : function (el, type, fn) {
		if (typeof addEventListener !== 'undefined') {
			el.addEventListener(type, fn, false);
		} else if (typeof attachEvent !== 'undefined') {
			el.attachEvent('on' + type, fn);
		} else {
			el['on' + type] = fn;
		}
	},
	removeEvent   : function (el, type, fn) {
		if (typeof addEventListener !== 'undefined') {
			el.removeEventListener(type, fn, false);
		} else if (typeof detachEvent !== 'undefined') {
			el.attachEvent('on' + type, fn);
		} else {
			el['on' + type] = null;
		}
	},
	getTarget     : function (event) {
		if (typeof event.target !== 'undefined') {
			return event.target;
		} else {
			return event.srcElement;
		}
	},
	preventDefault: function (event) {
		if (typeof event.preventDefault !== 'undefined') {
			event.preventDefault();
		} else {
			event.returnValue = false;
		}
	}
};

var player;
player = (function (api) {
	var config,
	    defaults = {
		    player_container   : '.player',
		    playerBar          : 'player-controls',
		    buttonClass        : 'btn',
		    screenReaderClass  : 'show-for-sr',
		    stateClassFor      : {
			    paused : 'paused',
			    muted  : 'muted',
			    playing: 'playing',
			    ended  : 'ended',
			    loading: 'loading'
		    },
		    buttonComponents   : {
			    restart: 'restart',
			    play   : 'play',
			    rewind : 'rewind',
			    forward: 'forward'
		    },
		    durationComponents : {
			    timeContainer: 'player-time',
			    timeCurrent  : 'player-current-time',
			    timeDuration : 'player-duration'
		    },
		    volumeComponents   : {
			    inputVolume: 'player-volume',
			    inputMute  : 'mute',
			    labelMute  : 'for-mute'
		    },
		    seekerComponents   : {
			    container: 'player-progress',
			    buffer   : 'player-progress-buffer',
			    played   : 'player-progress-played',
			    seek     : 'player-progress-seek'
		    },
		    seekTime           : 10,
		    volumeLevel        : 3,
		    syncedPlayers      : true,
		    storage            : {
			    enabled: true,
			    key    : 'volumeLevel'
		    },
		    colors             : {
			    main     : '#512698',
			    second   : '#704caa',
			    unvisible: '#665d76'
		    },
		    alt                : {
			    play        : 'Проиграть/Поставить на паузу',
			    restart     : 'Твоя песня хороша — начинай сначала',
			    rewind      : 'Перемотать назад',
			    forward     : 'Перемотать вперед',
			    timeDuration: 'Длительность',
			    timeCurrent : 'Текущее время',
			    buffered    : '% загружено',
			    played      : '% проиграно',
			    seek        : 'Перемотать на: ',
			    setVolume   : 'Громкость',
			    muted       : 'Выключить/включить звук'
		    },
		    playerCustomConfigs: {
			    thumb    : ['play'],
			    amp      : ['play', 'amp'],
			    //			    slider   : ['seeker', 'play', 'timeCurrent', 'timeDuration', 'mute', 'volume'],
			    slider   : ['play', 'mute', 'seeker', 'volume'],
			    video    : ['seeker', 'restart', 'play', 'rewind', 'forward', 'timeCurrent', 'timeDuration', 'mute', 'volume'],
			    'default': ['seeker', 'restart', 'play', 'rewind', 'forward', 'timeCurrent', 'timeDuration', 'mute', 'volume']
		    }
	    };

	// тут хранится инстанс последнего плеера, что
	// вызвал события played / paused
	var cashCurrentPlayer,
	    // и его id
	    cashID,
	    browser = _sniffer(),
	    xmlns = 'http://www.w3.org/2000/svg';

	// Вспомогательные функции 

	function _random_ceil(digits) {
		var numer = Math.ceil(Math.random() * Math.pow(10, digits));
		return numer;
	}

	// Глубокий (рекурсивный) мержинг двух объектов
	function _extend(destination, source) {
		for (var property in source) {
			if (source[property] && source[property].constructor &&
				source[property].constructor === Object) {
				destination[property] = destination[property] || {};
				_extend(destination[property], source[property]);
			}
			else {
				destination[property] = source[property];
			}
		}
		return destination;
	}

	function _remove(element) {
		element.parentNode.removeChild(element);
	}

	function _getPercentage(current, max) {
		if (current === 0 || max === 0 || isNaN(current) || isNaN(max)) {
			return 0;
		}
		return ((current / max) * 100).toFixed(2);
	}

	function _replaceAll(string, find, replace) {
		return string.replace(new RegExp(find.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1'), 'g'), replace);
	}

	function _toggleClass(element, name, state) {
		if (element) {
			if (element.classList) {
				element.classList[state ? 'add' : 'remove'](name);
			}
			else {
				var className     = (' ' + element.className + ' ').replace(/\s+/g,
					' ').replace(' ' + name + ' ', '');
				element.className = className + (state ? ' ' + name : '');
			}
		}
	}

	function _toggleHandler(element, events, callback, toggle) {
		events = events.split(' ');

		// Если был передан NodeList то рекурсивно сплитно вызваться
		if (element instanceof NodeList) {
			for (var x = 0; x < element.length; x++) {
				if (element[x] instanceof Node) {
					_toggleHandler(element[x], arguments[1], arguments[2],
						arguments[3]);
				}
			}
			return;
		}

		// Для одиночной ноды сплитим события
		for (var i = 0; i < events.length; i++) {
			element[toggle ? 'addEventListener' :
				'removeEventListener'](events[i], callback, false);
		}
	}

	// Привязка
	function _on(element, events, callback) {
		if (element) {
			_toggleHandler(element, events, callback, true);
		}
	}

	// Отвязка
	function _off(element, events, callback) {
		if (element) {
			_toggleHandler(element, events, callback, false);
		}
	}

	function _triggerEvent(element, event) {

		var fauxEvent = document.createEvent('MouseEvents');
		fauxEvent.initEvent(event, true, true);
		element.dispatchEvent(fauxEvent);
	}

	function _toggleCheckbox(event) {

		if (event.keyCode && event.keyCode != 13) {
			return true;
		}

		event.target.checked = !event.target.checked;
		_triggerEvent(event.target, "change");
	}

	function _storage() {
		var storage = {
			supported: (function () {
				try {
					return 'localStorage' in window &&
						window.localStorage !== null;
				}
				catch (e) {
					return false;
				}
			})()
		};
		return storage;
	}

	// Навеяно: http://paypal.github.io/accessible-html5-video-player/
	function _sniffer() {
		var nAgt         = navigator.userAgent,
		    name         = navigator.appName,
		    fullVersion  = "" + parseFloat(navigator.appVersion),
		    majorVersion = parseInt(navigator.appVersion, 10),
		    nameOffset,
		    verOffset,
		    ix;

		// MSIE 11
		if ((navigator.appVersion.indexOf("Windows NT") !== -1) && (navigator.appVersion.indexOf("rv:11") !== -1)) {
			name        = "IE";
			fullVersion = "11;";
		}
		// MSIE
		else if ((verOffset = nAgt.indexOf("MSIE")) !== -1) {
			name        = "IE";
			fullVersion = nAgt.substring(verOffset + 5);
		}
		// Chrome
		else if ((verOffset = nAgt.indexOf("Chrome")) !== -1) {
			name        = "Chrome";
			fullVersion = nAgt.substring(verOffset + 7);
		}
		// Safari
		else if ((verOffset = nAgt.indexOf("Safari")) !== -1) {
			name        = "Safari";
			fullVersion = nAgt.substring(verOffset + 7);
			if ((verOffset = nAgt.indexOf("Version")) !== -1) {
				fullVersion = nAgt.substring(verOffset + 8);
			}
		}
		// Firefox
		else if ((verOffset = nAgt.indexOf("Firefox")) !== -1) {
			name        = "Firefox";
			fullVersion = nAgt.substring(verOffset + 8);
		}
		// In most other browsers, "name/version" is at the end of userAgent 
		else if ((nameOffset = nAgt.lastIndexOf(" ") + 1) < (verOffset = nAgt.lastIndexOf("/"))) {
			name        = nAgt.substring(nameOffset, verOffset);
			fullVersion = nAgt.substring(verOffset + 1);

			if (name.toLowerCase() == name.toUpperCase()) {
				name = navigator.appName;
			}
		}
		// Trim the fullVersion string at semicolon/space if present
		if ((ix = fullVersion.indexOf(";")) !== -1) {
			fullVersion = fullVersion.substring(0, ix);
		}
		if ((ix = fullVersion.indexOf(" ")) !== -1) {
			fullVersion = fullVersion.substring(0, ix);
		}
		// Get major version
		majorVersion = parseInt("" + fullVersion, 10);
		if (isNaN(majorVersion)) {
			fullVersion  = "" + parseFloat(navigator.appVersion);
			majorVersion = parseInt(navigator.appVersion, 10);
		}
		// Сохраняем в общую переменную модуля
		return {
			name   : name,
			version: majorVersion,
			ios    : /(iPad|iPhone|iPod)/g.test(navigator.platform)
		};
	}

	assembleUI.cash = {};

	function assembleUI(primitive) {

		if (primitive in assembleUI.cash) {
			// console.log(primitive + ' взят из кеша');
			//не понял, почему я не могу клонировать на
			// этом уровне, а вынужден в montageUI, просто тогда в при первом
			// запуске происходит лишнее клонирование.
			return assembleUI.cash[primitive];
		}

		var container       = document.createElement('div');
		container.className = 'player-controls';

		function assembleButton(primitive) {
			var button                 = document.createElement('button');
			var span                   = document.createElement('span');
			button.type                = 'button';
			button.className           =
				defaults.buttonClass + ' ' + defaults.buttonComponents[primitive];
			span.className             = defaults.screenReaderClass;
			span.textContent           = defaults.alt[primitive]
				+ (primitive == 'rewind' || primitive == 'forward'
					? ' на ' + defaults.seekTime + 'c.' : ''); // Скобки!!!
			//			button.setAttribute('aria-label',
			// defaults.buttonComponents[primitive]);
			button.setAttribute('title', defaults.buttonComponents[primitive]);
			button.appendChild(span);
			assembleUI.cash[primitive] = button;
			return button;
		}

		function assembleSeeker() {
			var box      = document.createElement('div'),
			    buffered = document.createElement('progress'),
			    played   = document.createElement('progress'),
			    seeker   = document.createElement('input'),
			    label    = document.createElement('label');

			box.className = defaults.seekerComponents.container;

			played.value = buffered.value = seeker.value = '0';
			played.max = buffered.max = seeker.max = '100';

			buffered.className = defaults.seekerComponents.buffer;
			buffered.appendChild(document.createElement('span'));
			buffered.appendChild(document.createTextNode(defaults.alt.buffered));

			played.className = defaults.seekerComponents.played;
			played.appendChild(document.createElement('span'));
			played.appendChild(document.createTextNode(defaults.alt.played));

			label.className = defaults.screenReaderClass;
			label.htmlFor   = seeker.id = 'seeForlocalID';
			label.textContent = defaults.alt.seek;

			seeker.className       = defaults.seekerComponents.seek;
			seeker.min             = '0';
			seeker.type            = 'range';
			seeker.step            = '0.5';

			box.appendChild(label);
			box.appendChild(seeker);
			box.appendChild(played);
			box.appendChild(buffered);
			assembleUI.cash.seeker = box;
			return box;
		}

		function time(primitive) {
			var box       = document.createElement('div'),
			    labelTime = document.createElement('span'),
			    time      = document.createElement('span');

			labelTime.className        = defaults.screenReaderClass;
			labelTime.textContent      = defaults.alt[primitive];
			time.textContent           = '00:00';
			time.className             = defaults.durationComponents[primitive];
			box.className              = defaults.durationComponents.timeContainer;
			box.appendChild(labelTime);
			box.appendChild(time);
			assembleUI.cash[primitive] = box;
			return box;
		}

		function mute() {
			var box       = document.createDocumentFragment(),
			    label     = document.createElement('label'),
			    input     = document.createElement('input'),
			    labelSpan = document.createElement('span');

			input.className = defaults.screenReaderClass + ' ' + defaults.volumeComponents.inputMute;
			input.type      = 'checkbox';
			label.htmlFor   = input.id = 'mutedForlocalID';
			label.className = defaults.buttonClass + ' ' + defaults.volumeComponents.labelMute;

			labelSpan.textContent = defaults.alt.muted;
			labelSpan.className   = defaults.screenReaderClass;

			label.appendChild(labelSpan);
			box.appendChild(input);
			box.appendChild(label);

			assembleUI.cash.mute = box;
			return box;
		}

		function volume() {
			var box         = document.createDocumentFragment(),
			    labelVolume = document.createElement('label'),
			    inputVolume = document.createElement('input');

			labelVolume.className = defaults.screenReaderClass;
			labelVolume.htmlFor   = inputVolume.id = 'volumeForlocalID';
			labelVolume.textContent = defaults.alt.setVolume;
			inputVolume.className   = defaults.volumeComponents.inputVolume;
			inputVolume.min         = '0';
			inputVolume.max         = '10';
			inputVolume.type        = 'range';
			inputVolume.step        = '0.5';
			box.appendChild(labelVolume);
			box.appendChild(inputVolume);
			assembleUI.cash.volume  = box;
			return box;
		}

		function prepareAmp() {

			var object = document.createElement('object');
			object.setAttribute('type', 'image/svg+xml');
			return object;
		}

		switch (primitive) {
			case 'play':
			case 'restart':
			case 'rewind':
			case 'forward':
				return assembleButton(primitive);
			case 'seeker':
				return assembleSeeker();
			case 'mute':
				return mute();
			case 'volume':
				return volume();
			case 'timeCurrent':
			case 'timeDuration':
				return time(primitive);
			case 'amp':
				return prepareAmp();
			default :
				return false;
		}
	}

	function Playme(container) {
		var player       = this;
		player.container = container;

		function _getEl(selector) {
			return player.container.querySelector('.' + selector);
		}

		function _play() {
			// Здесь синхронизациия проигрывания всех плееров
			// Можно доделать асинхронный режим, а то пока грубо, но сам режим
			// так ужасен, что оставлю
			if (!config.syncedPlayers) {
				cashID            = player.container.id;
				cashCurrentPlayer = player;
			}

			if (cashID && cashID === player.container.id) {

				if (player.media.paused) {
					player.media.play();
				} else {
					player.media.pause();
				}

			} else if (cashID && cashID !== player.container.id) {
				if (!cashCurrentPlayer.media.paused) {
					cashCurrentPlayer.media.pause();
				}

				player.media.play();
			} else {
				player.media.play();
			}
			if (config.syncedPlayers) {
				cashID            = player.container.id;
				cashCurrentPlayer = player;
			}
		}

		function _checkPlaying() {
			_toggleClass(player.container, config.stateClassFor.playing,
				!player.media.paused);
			_toggleClass(player.container, config.stateClassFor.paused,
				player.media.paused);
		}

		function _inTheEnd() {
			_toggleClass(player.container, config.stateClassFor.paused,
				false);
			_toggleClass(player.container, config.stateClassFor.ended,
				player.media.paused);
			_seek();
		}

		function _rewind() {
			_seek(player.media.currentTime - config.seekTime);
		}

		function _forward() {
			_seek(player.media.currentTime + config.seekTime);
		}

		function _seek(input) {
			var targetTime = 0;

			// Если на входе количество в секундах
			if (typeof input === 'number') {
				targetTime = input;
			}
			// Или мы имеем дело с со инпутом диапазона, IE
			// ловим событие change
			else {
				if (typeof input === 'object' &&
					(input.type === 'input' ||
					input.type === 'change')) {

					targetTime = ((input.target.value / input.target.max) *
					player.media.duration);
				}
			}

			if (targetTime < 0)    targetTime = 0;
			else if (targetTime > player.media.duration) targetTime =
				player.media.duration;

			player.media.currentTime = targetTime.toFixed(1);
		}

		function _seekFromAmp(event) {
			var box   = player.diagramm.svg.getBoundingClientRect();
			var input = parseInt(((event.clientX - box.left) /
				(box.right - box.left) ) * player.media.duration,
				10);
			_seek(input);
		}

		function _updateProgress(event) {
			var progress = player.progress.played.bar,
			    text     = player.progress.played.text,
			    value    = 0;

			if (event) {
				switch (event.type) {

					// Любое проигрывание и поиск
					case "timeupdate":
					case "seeking":
						value = _getPercentage(player.media.currentTime, player.media.duration);

						//  Если появиться радиальный инпут, то точно надо будет
						// переписать

						// Здесь речь про простое проигрывание
						if (event.type == 'timeupdate' && player.buttons.seek) player.buttons.seek.value = value;
						if (event.type == 'timeupdate' && player.object) player.diagramm.rectAmp.setAttribute('width', value + '%');

						break;

					// События из инпута диапазона || ручной ввод
					case 'change':
					case 'input':
						value = event.target.value;

					// Проверяем буферизацию, playing событие начала
					// проигрывания, в начале или просто после недостатка
					// данных, progress при буфферизации порции данных
					case 'playing':
					case 'progress':
						progress = player.progress.buffer.bar;
						text     = player.progress.buffer.text;
						value    = (function () {
							var buffered = player.media.buffered;

							if (buffered.length) {
								return _getPercentage(buffered.end(0),
									player.media.duration);
							}
							return 0;
						})();
						break;
				}
			}
			if (progress) progress.value = value;
			if (text) text.innerHTML = value;
		}

		// Waiting происходит при нехватке данных или при поиске, эта
		// же функция обрабатывает и canplay (загружен минимум) и seeked
		// (закончен поиск) и назначаем класс для анимации процесса
		function _checkLoading(event) {
			var loading         = (event.type === 'waiting');

			clearTimeout(player.loadingTimer);
			player.loadingTimer = setTimeout(function () {
				_toggleClass(player.container, config.stateClassFor.loading,
					loading);
			}, (loading ? 250 : 0));
		}

		function _renderTimeDigits(time, element) {
			if (!element) return;

			player.secs  = parseInt(time % 60);
			player.mins  = parseInt((time / 60) % 60);
			player.hours = parseInt(((time / 60) / 60) % 60);

			var displayHours = (parseInt(((player.media.duration / 60) / 60) %
				60) > 0);

			player.secs = ('0' + player.secs).slice(-2);
			player.mins = ('0' + player.mins).slice(-2);

			element.innerHTML =
				(displayHours ? player.hours + ':' : '')
				+ player.mins + ':'
				+ player.secs;
		}

		function _displayDuration() {
			// Если показывается только одно текущее время, то до
			// запуска плеера показываем продолжительность вместо 00:00
			if (!player.duration && player.curTime) _renderTimeDigits(player.media.duration, player.curTime);
			if (player.duration) _renderTimeDigits(player.media.duration, player.duration);
		}

		function _timeUpdate(event) {
			_renderTimeDigits(player.media.currentTime, player.curTime);
			_updateProgress(event);
		}

		function _setVolume(volume) {
			if (typeof volume === 'undefined') {
				if (config.storage.enabled && _storage().supported) {
					volume = window.localStorage[config.storage.key]
						|| config.volumeLevel;
				} else {
					volume = config.volumeLevel;
				}

			}
			if (volume > 10) volume = 10;
			player.media.volume = parseFloat(volume / 10);

			if (!player.volume) return; // Есть плеера без контролов...
			player.volume.value = volume;
			if (config.storage.enabled && _storage().supported) {
				window.localStorage.setItem(config.storage.key, volume);
			}
			_checkMuteClass();
			_checkVolumeLevel(volume);
		}

		function _toggleMute(muted) {

			if (typeof muted === 'undefined') muted = !player.media.muted;
			player.buttons.mute.checked = muted;

			player.media.muted = muted;

			_checkMuteClass();
			_checkVolumeLevel();
		}

		function _checkMuteClass() {
			_toggleClass(player.container, "muted",
				(player.media.volume === 0 || player.media.muted));
		}

		function _checkVolumeLevel(volume) {
			if (volume == 0) {
				return player.buttons.muteLabel.setAttribute('data-volume', 'volumut');
			}
			if (volume < 3) {
				return player.buttons.muteLabel.setAttribute('data-volume', 'volumin');
			}
			if (volume < 6) {
				return player.buttons.muteLabel.setAttribute('data-volume', 'volumid');
			}

			return player.buttons.muteLabel.setAttribute('data-volume', 'volumax');
		}

		function injectControls() {

			player.configuration = player.container.getAttribute('data-player-config') || 'default';

			var localID   = _random_ceil(6),
			    playerBar = document.createElement('div'),
			    configUI  = config.playerCustomConfigs[player.configuration];

			playerBar.className = config.playerBar;

			function montageUI() {

				for (var i = 0; i < configUI.length; i++) {

					var control = assembleUI(configUI[i]).cloneNode(true);
					if (configUI[i] == 'amp') {
						player.container.appendChild(control);
						continue;
					}

					control && playerBar.appendChild(control);
				}
				if (player.configuration == 'amp') playerBar.appendChild(_getEl('title'));

				playerBar.innerHTML = _replaceAll(playerBar.innerHTML, 'localID', localID)
			}

			montageUI();

			player.container.insertBefore(playerBar, player.media.nextSibling);

			player.container.id = localID;
			if (player.container.hasAttribute('data-musDiagramm')) {
				var data      = player.container.getAttribute('data-musDiagramm');
				player.container.removeAttribute('data-musDiagramm');
				player.object = player.container.getElementsByTagName('object')[0];
				player.object.setAttribute('data', data);

				player.object.onload = prepareAmpDiagramm;
			}

			function prepareAmpDiagramm() {
				var svg,
				    allAmp,
				    progressAmp,
				    defs = document.createElementNS(xmlns, 'defs'),
				    rect = document.createElementNS(xmlns, 'rect'),
				    clip = document.createElementNS(xmlns, 'clipPath');

				clip.setAttribute('id', 'cut-off-progress');
				rect.setAttribute('width', '0%');
				rect.setAttribute('height', '100%');
				clip.appendChild(rect);
				defs.appendChild(clip);

				svg             =
					player.object.contentDocument.getElementsByTagName('svg')[0];
				allAmp          = svg.getElementById('amp');
				allAmp.setAttribute('cursor', 'pointer');
				progressAmp     = allAmp.cloneNode(true);
				progressAmp.id  = 'progress';
				progressAmp.setAttribute('clip-path',
					'url(#' + clip.getAttribute('id') + ')');
				progressAmp.setAttribute('fill', config.colors.main);
				allAmp.setAttribute('fill', config.colors.unvisible);
				//                svg.getAttribute('viewBox').split(' ');
				svg.insertBefore(defs, allAmp);
				svg.insertBefore(progressAmp, allAmp.nextSibling);
				player.ampState = 1;
			}

		}

		function referenceControls() {
			player.buttons           = {};
			player.buttons.play      = _getEl(config.buttonComponents.play);
			player.buttons.restart   = _getEl(config.buttonComponents.restart);
			player.buttons.rewind    = _getEl(config.buttonComponents.rewind);
			player.buttons.forward   = _getEl(config.buttonComponents.forward);
			player.buttons.mute      = _getEl(config.volumeComponents.inputMute);
			player.buttons.muteLabel = _getEl(config.volumeComponents.labelMute);
			player.buttons.seek      = _getEl(config.seekerComponents.seek);
			player.duration          = _getEl(config.durationComponents.timeDuration);
			player.curTime           = _getEl(config.durationComponents.timeCurrent);
			player.volume            = _getEl(config.volumeComponents.inputVolume);

			player.progress             = {};
			player.progress.container   = _getEl(config.seekerComponents.container);
			player.progress.played      = {};
			player.progress.played.bar  = _getEl(config.seekerComponents.played);
			player.progress.played.text = player.progress.played.bar &&
				player.progress.played.bar.getElementsByTagName('span')[0];
			player.progress.buffer      = {};
			player.progress.buffer.bar  = _getEl(config.seekerComponents.buffer);
			player.progress.buffer.text = player.progress.buffer.bar &&
				player.progress.buffer.bar.getElementsByTagName('span')[0];

			function referAmp() {
				player.diagramm = {};
				player.diagramm.svg         =
					player.object.contentDocument.getElementsByTagName('svg')[0];
				player.diagramm.allAmp      = player.diagramm.svg &&
					player.diagramm.svg.getElementById('amp');
				player.diagramm.progressAmp = player.diagramm.svg &&
					player.diagramm.svg.getElementById('progress');
				player.diagramm.rectAmp     = player.diagramm.svg &&
					player.diagramm.svg.querySelector('defs rect');
			}

			// Вообще нужно больше проверок по типу конфигурации / функциональности
			// Также синхронизировать время исполнения референсов и при условии успешной инжекции:
			//  Может пользовательские события для синхронизации?!
			// Может отдельный модуль?!

			if (player.object) {
				setTimeout(function checkingAmp() {
					if (player.ampState == 1) {
						referAmp();
						player.ampState++;
					} else setTimeout(checkingAmp, 300)
				}, 300);
			}
		}

		// Звучит заманчиво добавить делегированные прослушки

		function listeners() {
			var inputEvent = (browser.name == "IE" ? "change" : "input");

			_on(player.buttons.play, 'click', _play);
			if (player.buttons.rewind) _on(player.buttons.rewind, 'click', _rewind);
			if (player.buttons.restart) _on(player.buttons.restart, 'click', _seek);
			if (player.buttons.forward) _on(player.buttons.forward, 'click', _forward);
			if (player.duration) {
				_on(player.media, 'loadedmetadata durationchange', _displayDuration);
				// К моменту навешивания обработчика, событие уже могло произойти,
				// что и происходит при большом количестве плееров, поэтому
				// нет ничего проще чем:
				setTimeout(_displayDuration, 2000);
			}

			if (player.buttons.mute) _on(player.buttons.mute, 'change',
				function () {
					_toggleMute(this.checked);
				});

			if (player.buttons.seek) _on(player.buttons.seek, inputEvent, _seek);

			if (player.volume) {
				_on(player.volume, inputEvent, function () {
					_setVolume(this.value);
				});
			}
			_on(player.media, 'progress playing', _updateProgress);
			_on(player.media, 'waiting canplay seeked', _checkLoading);
			_on(player.media, 'play pause', _checkPlaying);
			_on(player.media, 'timeupdate', _timeUpdate);
			_on(player.media, 'seeking', _timeUpdate);
			_on(player.media, 'ended', _inTheEnd);

			if (player.type === 'video') {
				_on(player.media, 'click', _play);
			}

			if (player.object) {
				setTimeout(function checkingAmp() {
					if (player.ampState == 2) {
						_on(player.diagramm.svg, 'click', _seekFromAmp);
						player.ampState++;
					} else setTimeout(checkingAmp, 300)
				}, 300);
			}
		}

		function init() {
			player.media = player.container.querySelectorAll('audio, video')[0];
			if (!player.media) return false;

			player.type = player.media.tagName.toLowerCase();
			player.media.removeAttribute('controls');
			player.media.setAttribute('preload', 'metadata');
			_toggleClass(player.container, 'player-' + player.type, true);
			if(browser.ios) {
				_toggleClass(player.container, "ios", true);
			}


			injectControls();
			referenceControls();
			_setVolume();
			_displayDuration();
			listeners();
			return true;
		}

		init();

	}

	api.setup = function (options) {
		config       = _extend(defaults, options);
		var elements = document.querySelectorAll(config.player_container);
		var playmeZ  = [];

		for (var i = elements.length - 1; i >= 0; i--) {
			var element    = elements[i];
			var instance   = new Playme(element);
			element.player = (Object.keys(instance).length ? instance : false);
			// console.log(element.player);
			playmeZ.push(element);
		}
		// console.log(playmeZ);
		return playmeZ;
	};

	return api;

})
({});
