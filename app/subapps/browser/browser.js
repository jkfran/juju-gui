'use strict';


/**
   SubApp for the Browser

   @module juju
   @submodule subapps
 */
YUI.add('subapp-browser', function(Y) {
  var ns = Y.namespace('juju.subapps'),
      models = Y.namespace('juju.models');

  /**
     Browser Sub App for the Juju Gui.

     @class Browser
     @extends {juju.SubApp}
   */
  ns.Browser = Y.Base.create('subapp-browser', Y.juju.SubApp, [], {
    // Mark the entire subapp has hidden.
    hidden: false,

    /**
        Show or hide the details panel.

        @method _detailsVisible
        @param {Boolean} visible set the panel to hide or show.
     */
    _detailsVisible: function(visible) {
      var detailsNode = Y.one('.bws-view-data');
      if (detailsNode) {
        if (visible) {
          detailsNode.show();
        }
        else {
          detailsNode.hide();
        }
      }
    },

    /**
        Given the current subapp state, generate a url to pass up to the
        routing code to route to.

        @method _getStateUrl
        @param {Object} change the values to change in the current state.
     */
    _getStateUrl: function(change) {
      var urlParts = ['/bws'];
      this._oldState = this._viewState;

      // If there are changes to the filters, we need to update our filter
      // object first, and then generate a new query string for the state to
      // track.
      if (change.filter) {
        this._filter.update(change.filter);
        change.querystring = this._filter.genQueryString();
      }

      this._viewState = Y.merge(this._viewState, change);

      urlParts.push(this._viewState.viewmode);
      if (this._viewState.search) {
        urlParts.push('search');
      }
      if (this._viewState.charmID) {
        urlParts.push(this._viewState.charmID);
      }
      var url = urlParts.join('/');
      if (this._viewState.querystring) {
        url = Y.Lang.sub('{ url }?{ qs }', {
          url: url,
          qs: this._viewState.querystring
        });
      }
      return url;
    },

    /**
       Generate a standard shared set of cfg all Views can expect to see.

       @method _getViewCfg
       @param {Object} cfg additional config to merge into the default view
       config.
     */
    _getViewCfg: function(cfg) {
      // We always add the _filter data to every request because most of them
      // need to know if there's a search term for rendering the search
      // input and later the charm details will need to know for selecting
      // the proper backup icon.
      return Y.merge(cfg, {
        db: this.get('db'),
        filters: this._filter.getFilterData(),
        store: this.get('store')
      });
    },

    /**
       Create an initial subapp state for later url generation.

       @method _initState
     */
    _initState: function() {
      this._oldState = {
        charmID: null,
        querystring: null,
        search: null,
        viewmode: null
      };
      this._viewState = Y.merge(this._oldState, {});
    },

    /**
       Determine if we should render the charm details based on the current
       state.

       @return {Boolean} true if should show.
     */
    _shouldShowCharm: function() {
      if (
          this._viewState.charmID &&
          (
           this._hasStateChanged('charmID') ||
           this._hasStateChanged('viewmode')
          )
      ) {
        return true;
      } else {
        return false;
      }
    },

    /**
       Determine if we should render the editorial content based on the current
       state.

       @return {Boolean} true if should show.
     */
    _shouldShowEditorial: function() {
      if (
          !this._viewState.search &&
          this._hasStateChanged('viewmode')
      ) {
        return true;
      } else {
        return false;
      }
    },

    /**
       Determine if we should render the search results based on the current
       state.

       @return {Boolean} true if should show.
     */
    _shouldShowSearch: function() {
      if (
          this._viewState.search &&
          (
           this._hasStateChanged('search') ||
           this._hasStateChanged('viewmode') ||
           this._hasStateChanged('querystring') ||
           (this._hasStateChanged('charmID') && !this._viewState.charmID)
          )
      ) {
        return true;
      } else {
        return false;
      }
    },

    /**
       Verify that a particular part of the state has changed.

       @method _hasStateChanged
       @param {String} field the part of the state to check.
     */
    _hasStateChanged: function(field) {
      if (this._oldState[field] === this._viewState[field]) {
        return false;
      } else {
        return true;
      }
    },

    /**
       Update the oldState with the viewState now that we're done processing
       the request.

       @method _saveState
     */
    _saveState: function() {
      this._oldState = Y.merge(
          this._oldState,
          this._viewState);
    },

    /**
       Given the params in the route determine what the new state is going to
       be.

       @method _updateState
       @param {Object} req the request payload.
     */
    _updateState: function(req) {
      // Update the viewmode. Every request has a viewmode.
      var path = req.path,
          params = req.params,
          query = req.query;

      this._viewState.viewmode = params.viewmode;

      // Check for a charm id in the request.
      if (params.id && params.id !== 'search') {
        // Make sure we clear out any accidental matching of search/ in the
        // url.
        this._viewState.charmID = params.id.replace(/^search\//, '');
      } else {
        this._viewState.charmID = null;
      }

      // Check for search in the request.
      if (path.indexOf('search') !== -1) {
        this._viewState.search = true;
      } else {
        this._viewState.search = false;
      }

      // Check if there's a query string to set.
      if (query) {
        // Store it as a straight string.
        this._viewState.querystring = Y.QueryString.stringify(query);
      } else {
        this._viewState.querystring = null;
      }

      this._filter.update(query);
    },

    /**
       The available Views run from this sub app.
       @attribute views
     */
    views: {
      fullscreen: {
        type: 'juju.browser.views.FullScreen',
        preserve: false
      },
      sidebar: {
        type: 'juju.browser.views.Sidebar',
        preserve: false
      }
    },

    /**
       Cleanup after ourselves on destroy.

       @method destructor
     */
    destructor: function() {
      this._cacheCharms.destroy();
      delete this._viewState;
    },

    /**
       General app initializer

       @method initializer
       @param {Object} cfg general init config object.
     */
    initializer: function(cfg) {
      // Hold onto charm data so we can pass model instances to other views when
      // charms are selected.
      this._cacheCharms = new models.BrowserCharmList();
      this._initState();
      this._filter = new models.browser.Filter();

      // Listen for navigate events from any views we're rendering.
      this.on('*:viewNavigate', function(ev) {
        var url;
        if (ev.url) {
          url = ev.url;
        } else if (ev.change) {
          url = this._getStateUrl(ev.change);
        }
        this.navigate(url);
      });
    },

    /**
       Render the charm details view

       @method renderCharmDetails
       @param {Request} req current request object.
       @param {Response} res current response object.
       @param {function} next callable for the next route in the chain.
     */
    renderCharmDetails: function(req, res, next) {
      var charmID = this._viewState.charmID;
      var extraCfg = {
        charmID: charmID,
        container: Y.Node.create('<div class="charmview"/>'),
        deploy: this.get('deploy')
      };

      // The details view needs to know if we're using a fullscreen template
      // or the sidebar version.
      if (this._viewState.viewmode === 'fullscreen') {
        extraCfg.isFullscreen = true;
      }

      // Gotten from the sidebar creating the cache.
      var model = this._cacheCharms.getById(charmID);

      if (model) {
        extraCfg.charm = model;
      }

      this._details = new Y.juju.browser.views.BrowserCharmView(
          this._getViewCfg(extraCfg));
      this._details.render();
      this._details.addTarget(this);
    },

    /**
       Render editorial content into the parent view when required.

       The parent view is either fullscreen/sidebar which determines how the
       editorial content is to be rendered.

       @method renderEditorial
       @param {Request} req current request object.
       @param {Response} res current response object.
       @param {function} next callable for the next route in the chain.
     */
    renderEditorial: function(req, res, next) {
      // If loading the interesting content then it's not a search going on.
      var container = this.get('container'),
          extraCfg = {};

      if (this._viewState.viewmode === 'fullscreen') {
        // The fullscreen view requires that there be no editorial content if
        // we're looking at a specific charm. The div we dump our content into
        // is shared. So if the url is /fullscreen show editorial content, but
        // if it's not, there's something else handling displaying the
        // view-data.
        extraCfg.renderTo = container.one('.bws-view-data');
        extraCfg.isFullscreen = true;
      } else {
        // If this is the sidebar view, then the editorial content goes into a
        // different div since we can view both editorial content and
        // view-data (such as a charm details) side by side.
        extraCfg.renderTo = container.one('.bws-content');
      }

      // If there's a selected charm we need to pass that info onto the View
      // to render it selected.
      if (this._viewState.charmID) {
        extraCfg.activeID = this._viewState.charmID;
      }

      this._editorial = new Y.juju.browser.views.EditorialView(
          this._getViewCfg(extraCfg));

      this._editorial.render();
      this._editorial.addTarget(this);

      // Add any sidebar charms to the running cache.
      this._cacheCharms.add(this._editorial._cacheCharms);
    },

    /**
       Render search results

       @method renderSearchResults
       @param {Request} req current request object.
       @param {Response} res current response object.
       @param {function} next callable for the next route in the chain.
     */
    renderSearchResults: function(req, res, next) {
      var container = this.get('container'),
          extraCfg = {};

      if (req.params.viewmode === 'fullscreen') {
        extraCfg.renderTo = container.one('.bws-view-data');
        extraCfg.isFullscreen = true;
      } else {
        extraCfg.renderTo = container.one('.bws-content');
      }

      this._search = new Y.juju.browser.views.BrowserSearchView(
          this._getViewCfg(extraCfg));

      this._search.render();
      this._search.addTarget(this);
    },

    /**
       Render the fullscreen view to the client.

       @method fullscreen
       @param {Request} req current request object.
       @param {Response} res current response object.
       @param {function} next callable for the next route in the chain.
     */
    fullscreen: function(req, res, next) {
      // If we've switched to viewmode fullscreen, we need to render it.
      // We know the viewmode is already fullscreen because we're in this
      // function.
      if (this._hasStateChanged('viewmode')) {
        this._fullscreen = this.showView('fullscreen', this._getViewCfg());
      }

      // If we've changed the charmID or the viewmode has changed and we have
      // a charmID, render charmDetails.
      if (this._shouldShowCharm()) {
        this._detailsVisible(true);
        this.renderCharmDetails(req, res, next);
      } else if (this._shouldShowSearch()) {
        // Render search results if search is in the url and the viewmode or
        // the search has been changed in the state.
        this.renderSearchResults(req, res, next);
      } else if (!this._viewState.search && !this._viewState.charmID) {
        // Render the editorial in fullscreen only if we don't have a charmid
        this.renderEditorial(req, res, next);
      }

      // Sync that the state has changed.
      this._saveState();
      next();
    },

    /**
       Minimized state shows the button to open back up, but that's it. It's
       purely a viewmode change and we keep all the old content/state in the
       old div.

       @method minimized
       @param {Request} req current request object.
       @param {Response} res current response object.
       @param {function} next callable for the next route in the chain.

     */
    minimized: function(req, res, next) {
      // We only need to run the view once.
      if (!this._minimized) {
        this._minimized = new Y.juju.browser.views.MinimizedView();
        this._minimized.render();
        this._minimized.addTarget(this);
      }

      this._minimized.set(
          'oldViewMode',
          this._oldState.viewmode ? this._oldState.viewmode : 'sidebar');
    },

    /**
       Handle the route for the sidebar view.

       @method sidebar
       @param {Request} req current request object.
       @param {Response} res current response object.
       @param {function} next callable for the next route in the chain.
     */
    sidebar: function(req, res, next) {
      // If we've switched to viewmode sidebar, we need to render it.
      if (this._hasStateChanged('viewmode')) {
        this._sidebar = this.showView('sidebar', this._getViewCfg());
      }

      // Render search results if search is in the url and the viewmode or the
      // search has been changed in the state.
      if (this._shouldShowSearch()) {
        // Showing search implies that other sidebar content is destroyed.
        if (this._editorial) {
          this._editorial.destroy();
        }

        this.renderSearchResults(req, res, next);
      }

      if (this._shouldShowEditorial()) {
        // Showing editorial implies that other sidebar content is destroyed.
        if (this._search) {
          this._search.destroy();
        }

        this.renderEditorial(req, res, next);
      }

      // If we've changed the charmID or the viewmode has changed and we have
      // a charmID, render charmDetails.
      if (this._shouldShowCharm()) {
        this._detailsVisible(true);
        this.renderCharmDetails(req, res, next);
      }

      // If there are no details in the route then hide the div for
      // viewing the charm details.
      if (!this._viewState.charmID) {
        this._detailsVisible(false);
        var detailsNode = Y.one('.bws-view-data');
        if (detailsNode) {
          detailsNode.hide();
        }
        // Clean up any details we've got.
        if (this._details) {
          this._details.destroy({remove: true});
        }
      }

      // Sync that the state has changed.
      this._saveState();
      next();
    },

    /**
       Dispatch to the correct viewmode based on the route that was hit.

       @method routeView
       @param {Request} req current request object.
       @param {Response} res current response object.
       @param {function} next callable for the next route in the chain.
     */
    routeView: function(req, res, next) {
      // Update the state for the rest of things to figure out what to do.
      this._updateState(req);

      // Once the state is updated determine visibility of our Nodes.
      this.updateVisible();

      // Don't bother routing if we're hidden.
      if (!this.hidden) {
        this[req.params.viewmode](req, res, next);
      }
    },

    /**
      Based on the viewmode and the hidden check what divs we should be
      showing or hiding.

    */
    updateVisible: function() {
      var minview = this.get('minNode'),
          browser = this.get('container');

      // In app tests these divs don't exist so ignore them if both aren't
      // there carry on. The container is created through the subapp, but not
      // the minview.
      if (!minview) {
        console.log('No browser subapp min div available.');
        return;
      }

      if (this.hidden) {
        browser.hide();
        minview.hide();
      } else {
        if (this._viewState.viewmode === 'minimized') {
          minview.show();
          browser.hide();
        } else {
          minview.hide();
          browser.show();
          // @todo remove this when the browser is in the default view since
          // we'll be using the hidden/minimized to move it back.
          this.get('container').setStyle('display', 'block');
        }
      }
    }
  }, {
    ATTRS: {
      /**
         @attribute container
         @default '#subapp-browser'
         @type {String}
       */
      container: {
        value: '#subapp-browser'
      },

      /**
         @attribute store
         @default Charmworld0
         @type {Charmworld0}
       */
      store: {
        /**
           We keep one instance of the store and will work on caching results
           at the app level so that routes can share api calls. However, in
           tests there's no config for talking to the api so we have to watch
           out in test runs and allow the store to be broken.

           method store.valueFn
        */
        valueFn: function() {
          var url = '';
          if (!window.juju_config || ! window.juju_config.charmworldURL) {
            console.error('No juju config to fetch charmworld store url');
          } else {
            url = window.juju_config.charmworldURL;
          }
          return new Y.juju.Charmworld0({
            'apiHost': url
          });
        }
      },

      /**
         @attribute routes
         @default Array of subapp routes.
         @type {Array}
       */
      routes: {
        value: [
          // Double routes are needed to catch /fullscreen and /fullscreen/
          { path: '/bws/:viewmode/', callbacks: 'routeView' },
          { path: '/bws/:viewmode/search/', callbacks: 'routeView' },
          { path: '/bws/:viewmode/search/*id/', callbacks: 'routeView' },
          { path: '/bws/:viewmode/*id/', callbacks: 'routeView' }
        ]
      },

      /**
         @attribute urlNamespace
         @default 'charmstore'
         @type {String}
       */
      urlNamespace: {
        value: 'charmstore'
      },

      /**
         The "deploy" function prompts the user for service configuration and
         deploys a service.

         @attribute deploy
         @default undefined
         @type {Function}
       */
      deploy: {},

      /**
         @attribute minNode
         @default Node
         @type {Node}

       */
      minNode: {
        /**
          Find the minNode and cache it for later use.

        */
        valueFn: function() {
          return Y.one('#subapp-browser-min');
        }
      }

    }
  });

}, '0.1.0', {
  requires: [
    'juju-browser-models',
    'juju-charm-store',
    'juju-models',
    'querystring',
    'sub-app',
    'subapp-browser-charmview',
    'subapp-browser-editorial',
    'subapp-browser-fullscreen',
    'subapp-browser-minimized',
    'subapp-browser-searchview',
    'subapp-browser-sidebar'
  ]
});
